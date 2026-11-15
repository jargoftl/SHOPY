import nodemailer, { type Transporter } from 'nodemailer'

type NotificationEvent = 'registered' | 'login'

interface EmailUser {
  id: number
  full_name: string
  email: string
  phone: string | null
  role: 'customer' | 'seller' | 'admin'
}

interface EmailMessage {
  to: string
  subject: string
  text: string
}

interface SellerCodeEmail {
  to: string
  name: string
  code: string
  siteName: string
}

const smtpConfigured = Boolean(
  process.env.SMTP_HOST &&
  process.env.SMTP_PORT &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASSWORD &&
  process.env.EMAIL_FROM,
)

const transporter: Transporter | null = smtpConfigured
  ? nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  })
  : null
export const isEmailConfigured = (): boolean => transporter !== null || Boolean(process.env.BREVO_API_KEY && process.env.EMAIL_FROM)

// Auto permits ordinary signup while delivery is unconfigured; a configured
// provider must still deliver/verify the code. Delivery failure never bypasses it.
export const isSellerEmailVerificationRequired = (): boolean =>
  process.env.SELLER_EMAIL_VERIFICATION === 'required'
  || (process.env.SELLER_EMAIL_VERIFICATION !== 'disabled' && isEmailConfigured())

const sendEmail = async ({ to, subject, text }: EmailMessage): Promise<boolean> => {
  if (!isEmailConfigured() || !to) return false

  try {
    // HTTPS transport works when a host restricts common SMTP ports. Existing SMTP is retained.
    if (process.env.BREVO_API_KEY) {
      const from = process.env.EMAIL_FROM!.trim()
      const named = from.match(/^(.*?)\s*<([^<>]+)>$/)
      const sender = named ? { name: named[1].trim(), email: named[2].trim() } : { email: from }
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text }),
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) throw new Error(`HTTPS email provider returned ${response.status}`)
      return true
    }
    await transporter!.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      text,
    })
    return true
  } catch (error: unknown) {
    console.error(`Email delivery failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    return false
  }
}

export const sendSellerVerificationCode = ({ to, name, code, siteName }: SellerCodeEmail): Promise<boolean> => sendEmail({
  to,
  subject: `Verify your ${siteName} email`,
  text: `Hi ${name},\n\nYour ${siteName} verification code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
})

export const sendPasswordResetEmail = (to: string, resetUrl: string | null, siteName: string): Promise<boolean> => sendEmail({
  to,
  subject: `${siteName} password reset request`,
  text: resetUrl
    ? `A password reset was requested for your ${siteName} account.\n\nOpen this link to choose a new password:\n${resetUrl}\n\nThe link expires in 30 minutes and can be used once. If you did not request this, ignore this email.`
    : 'A password reset was requested for this email address. If you did not request this, ignore this email.',
})

export const sendAuthNotifications = async (user: EmailUser, event: NotificationEvent, siteName: string): Promise<{ userEmailSent: boolean; adminEmailSent: boolean }> => {
  if (!isEmailConfigured()) {
    console.info('SMTP is not configured; account email notifications were skipped.')
    return { userEmailSent: false, adminEmailSent: false }
  }

  const happenedAt = new Date().toLocaleString('en', { timeZone: 'UTC', timeZoneName: 'short' })
  const isRegistration = event === 'registered'
  const userSubject = isRegistration ? `Welcome to ${siteName}` : `New sign-in to your ${siteName} account`
  const userText = isRegistration
    ? `Hi ${user.full_name},\n\nYour ${siteName} account has been created. Your member ID is #${user.id}.\n\nIf you did not create this account, please contact the store owner.`
    : `Hi ${user.full_name},\n\nYour ${siteName} account was signed in to at ${happenedAt}.\n\nIf this was not you, contact the store owner and change your password.`
  const ownerEmail = process.env.ADMIN_NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL
  const adminSubject = isRegistration ? `New ${siteName} account #${user.id}` : `${siteName} sign-in for account #${user.id}`
  const adminText = [
    `Event: ${isRegistration ? 'New account registration' : 'Account sign-in'}`,
    `Member ID: #${user.id}`,
    `Name: ${user.full_name}`,
    `Role: ${user.role}`,
    `Email: ${user.email}`,
    `Phone: ${user.phone || 'Not provided'}`,
    `Time: ${happenedAt}`,
  ].join('\n')

  const [userEmailSent, adminEmailSent] = await Promise.all([
    sendEmail({ to: user.email, subject: userSubject, text: userText }),
    ownerEmail && ownerEmail.toLowerCase() !== user.email.toLowerCase()
      ? sendEmail({ to: ownerEmail, subject: adminSubject, text: adminText })
      : Promise.resolve(false),
  ])

  return { userEmailSent, adminEmailSent }
}

export const sendSellerApprovalEmail = (to: string, name: string, siteName: string): Promise<boolean> => {
  const configured = process.env.APP_URL || 'https://shopystoretech.netlify.app'
  let loginUrl = ''
  try { const url = new URL('/seller/login', configured); if (url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost')) loginUrl = url.toString() } catch { /* Email still explains how to sign in. */ }
  return sendEmail({ to, subject: `Your ${siteName} seller application is approved`, text: `Hi ${name},\n\nCongratulations! Your application to become a seller on ${siteName} has been approved by our administrator.\n\nYou can now sign in and manage your store${loginUrl ? `: ${loginUrl}` : '.'}\n\nWelcome aboard!\nThe ${siteName} team` })
}
