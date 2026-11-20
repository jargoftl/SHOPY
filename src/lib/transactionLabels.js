export const transactionActor = role => role==='admin'?'Support team':role==='seller'?'Store account':role==='customer'?'Account holder':'System'
const types={admin_funding:'Support credit',sale_release:'Sale proceeds',sale_refund:'Sale refund',purchase_payment:'Purchase payment',referral_reward:'Referral reward',withdrawal_hold:'Withdrawal hold',withdrawal_rejected:'Withdrawal hold released',deposit:'Verified deposit',withdrawal:'Withdrawal'}
export const transactionType = kind => types[kind]||String(kind||'Transaction').replaceAll('_',' ')
export const transactionNote = note => note==='Administrator action'?'Support adjustment':note||''
