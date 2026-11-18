// Signup works without an email provider unless the owner explicitly enables codes.
export const registrationEmailRequired=()=>process.env.REGISTRATION_EMAIL_VERIFICATION==='required'
