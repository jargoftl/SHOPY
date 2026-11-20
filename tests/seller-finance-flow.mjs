import {randomUUID} from 'node:crypto'
export async function testSellerFinance({req,check,db,cookie,seller,buyer,sellerId,buyerId}) {
 const post=(path,body,who=seller,method='POST')=>req(path,{method,body:JSON.stringify(path==='/api/seller/finance/requests'?{transactionPin:'0456',...body}:body)},who)
 let r=await req('/api/auth/me',{},seller);const publicId=r.data.user.publicId
 check('seller reference starts with 00 and eight digits',/^00[1-9]\d{7}$/.test(publicId))
 r=await req('/api/auth/me',{},buyer);check('buyer reference starts with 21 and eight digits',/^21[1-9]\d{7}$/.test(r.data.user.publicId)&&r.data.user.publicId!==publicId)
 r=await req('/api/products');check('all public products have eight digit references',r.data.products.every(p=>/^[1-9]\d{7}$/.test(p.publicId)))
 r=await req('/api/warehouse',{},seller);check('warehouse products have public references',r.data.products.every(p=>/^[1-9]\d{7}$/.test(p.publicId)))
 for(const path of ['/api/seller/finance','/api/seller/analytics']){r=await req(path,{},buyer);check('buyer denied '+path,r.status===403)}
 r=await req('/api/admin/seller-finance',{},seller);check('seller cannot review funds',r.status===403)
 r=await req('/api/seller/analytics',{},seller);check('actual dashboard has real daily sales and visits',r.status===200&&Array.isArray(r.data.daily)&&Array.isArray(r.data.visits))
 let setup=await post('/api/account/transaction-pin',{pin:'0456',confirmPin:'0456',loginPassword:'long-test-password-123'},seller,'PUT');check('seller can set four-digit transaction PIN',setup.status===200,setup)
 const available=(await req('/api/seller/finance',{},seller)).data.depositWallets
 check('seller sees admin-configured deposit wallets', ['BTC','ETH','USDT'].every(coin=>available.some(wallet=>wallet.coin===coin&&wallet.network))&&!available.some(wallet=>wallet.coin==='DOGE'))
 const walletPath='/api/seller/finance/deposit-wallets/USDT'
 const wallet=(await req(walletPath,{},seller)).data
 check('seller can preview configured address and QR before starting a deposit',wallet.address==='test-address'&&wallet.network==='Test'&&wallet.usdRate==='1'&&wallet.qrUrl?.startsWith('data:image/png;base64,')&&wallet.version)
 r=await req(walletPath,{},buyer);check('buying account cannot preview seller deposit wallet',r.status===403,r)
 r=await req('/api/seller/finance/deposit-wallets/DOGE',{},seller);check('unconfigured wallet preview is unavailable',r.status===404,r)
 const deposit={kind:'deposit',coin:'USDT',amountCents:20000,requestKey:randomUUID(),walletVersion:wallet.version}
 r=await post('/api/seller/finance/requests',{...deposit,coin:'DOGE'});check('unconfigured deposit wallet is rejected',r.status===409,r)
 r=await post('/api/seller/finance/requests',{...deposit,walletVersion:'stale-wallet'});check('deposit rejects changed wallet details',r.status===409,r)
 r=await post('/api/seller/finance/requests',{...deposit,address:'ignored-address'});check('seller requests deposit',r.status===201,r)
 const depositId=r.data.id
 r=await post('/api/seller/finance/requests',deposit);check('deposit retry returns original request ID',r.status===201&&r.data.id===depositId&&r.data.status==='awaiting_receipt',r)
 let finance=(await req('/api/seller/finance',{},seller)).data;const q=finance.requests[0]
 check('deposit retries do not duplicate',finance.requests.length===1&&finance.wallet.balanceCents===0)
 const adminPath='/api/admin/seller-finance/requests/'+q.id
 r=await post(adminPath,{action:'confirm',verified:true,transferReference:'fixture-deposit'},cookie,'PATCH');check('deposit cannot credit before receipt',r.status===409)
 check('configured deposit is ready and uses the admin destination',q.id===depositId&&q.status==='awaiting_receipt'&&q.network==='Test'&&q.address==='test-address'&&q.coin_amount==='200.00000000'&&q.hasQr&&!('qr_image' in q),q)
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9kAAAAASUVORK5CYII=','base64')
 r=await post('/api/admin/payment-wallets/USDT',{network:'New network',address:'new-address',usdRate:'2'},cookie,'PUT');check('admin can update wallet after a deposit starts',r.status===200,r)
 finance=(await req('/api/seller/finance',{},seller)).data
 check('pending deposit keeps original wallet and rate after admin update',finance.requests[0].address===q.address&&finance.requests[0].usd_rate===q.usd_rate&&finance.requests[0].hasQr)
 r=await req(`/api/seller/finance/requests/${q.id}/qr`,{},seller);check('seller can load locked wallet QR screenshot',r.status===200,r)
 r=await req(`/api/seller/finance/requests/${q.id}/qr`,{},buyer);check('buyer cannot access seller deposit QR screenshot',r.status===403,r)
 r=await post('/api/admin/payment-wallets/USDT',{network:'Test',address:'test-address',usdRate:'1',qr:{type:'image/png',data:png.toString('base64')}},cookie,'PUT');check('restore configured wallet fixture',r.status===200,r)
 check('buyers cannot submit seller payment receipts',(await req(`/api/seller/finance/requests/${q.id}/receipt`,{method:'POST',body:png,headers:{'Content-Type':'image/png'}},buyer)).status===403)
 r=await req(`/api/seller/finance/requests/${q.id}/receipt`,{method:'POST',body:png,headers:{'Content-Type':'image/png','X-Payment-Reference':'fixture-deposit'}},seller);check('private seller deposit receipt uploaded',r.status===200,r)
 finance=(await req('/api/seller/finance',{},seller)).data
 const review=(await req('/api/admin/seller-finance',{},cookie)).data.requests.find(request=>request.id===q.id)
 check('admin sees screenshot and submitted reference without crediting seller',review.status==='awaiting_review'&&review.receiptId&&review.submitted_reference==='fixture-deposit'&&!review.transfer_reference&&finance.wallet.balanceCents===0,review)
 r=await req('/api/seller/finance/receipts/'+finance.requests[0].receiptId,{},buyer);check('another buyer cannot read receipt',r.status===404)
 r=await post(adminPath,{action:'confirm',verified:false,transferReference:'fixture-deposit'},cookie,'PATCH');check('admin must independently verify payment',r.status===409)
 r=await post(adminPath,{action:'confirm',verified:true,transferReference:'fixture-deposit'},cookie,'PATCH');check('verified deposit credits wallet',r.status===200,r)
 r=await post(adminPath,{action:'confirm',verified:true,transferReference:'fixture-deposit'},cookie,'PATCH');check('repeat confirmation is refused',r.status===409)
 finance=(await req('/api/seller/finance',{},seller)).data;check('deposit ledger credits once',finance.wallet.balanceCents===20000&&finance.records.length===1)
 const withdrawal={kind:'withdrawal',coin:'USDT',amountCents:15000,requestKey:randomUUID(),network:'TRC20',address:'fixture-seller-address',transactionPin:'0456'}
 r=await post('/api/seller/finance/requests',{...withdrawal,transactionPin:'9999'});check('withdrawal requires transaction PIN',r.status===403)
 r=await post('/api/seller/finance/requests',withdrawal);check('withdrawal reserves real funds',r.status===201,r)
 await post('/api/seller/finance/requests',withdrawal)
 finance=(await req('/api/seller/finance',{},seller)).data;check('withdrawal retry reserves only once',finance.wallet.balanceCents===20000&&finance.wallet.reservedCents===15000)
 r=await post('/api/seller/finance/requests',{...withdrawal,requestKey:randomUUID()});check('cannot overspend pending holds',r.status===409)
 let w=finance.requests[0]
 r=await post('/api/admin/seller-finance/requests/'+w.id,{action:'reject',instructions:'Fixture rejection'},cookie,'PATCH');check('admin rejects withdrawal',r.status===200)
 finance=(await req('/api/seller/finance',{},seller)).data;check('rejection releases hold without debit',finance.wallet.balanceCents===20000&&finance.wallet.reservedCents===0)
 r=await post('/api/seller/finance/requests',{...withdrawal,requestKey:randomUUID()});finance=(await req('/api/seller/finance',{},seller)).data;w=finance.requests[0]
 r=await post('/api/admin/seller-finance/requests/'+w.id,{action:'quote',usdRate:'1'},cookie,'PATCH');check('admin locks withdrawal coin conversion',r.status===200,r)
 r=await post('/api/admin/seller-finance/requests/'+w.id,{action:'confirm',verified:true,transferReference:'fixture-outgoing'},cookie,'PATCH');check('admin confirms outgoing transfer',r.status===200,r)
 finance=(await req('/api/seller/finance',{},seller)).data;check('outgoing transfer debits and releases hold',finance.wallet.balanceCents===5000&&finance.wallet.reservedCents===0)
 // Synthetic external sale fixture: no blockchain or live payment is used.
 const o=(await db.query("INSERT INTO shop.purchase_orders(buyer_id,request_key,coin,billing_json,subtotal_cents,status) VALUES($1,$2,'USDT','{}',12345,'paid') RETURNING id",[buyerId,randomUUID()])).rows[0].id
 await db.query("INSERT INTO shop.order_numbers(kind,order_id,number) VALUES('purchase',$1,87654321)",[o])
 await db.query("INSERT INTO shop.purchase_items(order_id,seller_id,name,image_url,price_cents,quantity,color,size) VALUES($1,$2,'Finance fixture','',12345,1,'','')",[o,sellerId])
 await db.query("INSERT INTO shop.purchase_sellers(order_id,seller_id,status) VALUES($1,$2,'pending')",[o,sellerId])
 const release={orderId:o,sellerId,amountCents:12345,verified:true}
 r=await post('/api/admin/seller-finance/releases',release,cookie);check('undelivered sale cannot be released',r.status===409)
 await db.query("UPDATE shop.purchase_sellers SET status='delivered' WHERE order_id=$1",[o])
 r=await post('/api/admin/seller-finance/releases',release,cookie);check('admin releases full product sale amount',r.status===200,r)
 r=await post('/api/admin/seller-finance/releases',release,cookie);check('sale cannot be released twice',r.status===409)
 finance=(await req('/api/seller/finance',{},seller)).data;check('full sale posted to wallet',finance.wallet.balanceCents===17345)
 const refund=(await db.query("INSERT INTO shop.purchase_refunds(order_id,seller_id,buyer_id,reason,status) VALUES($1,$2,$3,'Finance fixture refund','approved') RETURNING id",[o,sellerId,buyerId])).rows[0].id
 r=await post('/api/admin/refunds/'+refund+'/complete',{verified:true,transferReference:'fixture-refund'},cookie,'PATCH');check('completed refund reverses released sale funds',r.status===200,r)
 finance=(await req('/api/seller/finance',{},seller)).data;check('refund restores pre-sale balance and adds reversal ledger',finance.wallet.balanceCents===5000&&finance.records[0].kind==='sale_refund')
 r=await post('/api/admin/seller-finance/releases',release,cookie);check('refunded sale cannot be released again',r.status===409)
 r=await req('/api/seller/analytics',{},seller);check('dashboard activity is recorded from real fund and order changes',r.status===200&&r.data.activity.some(a=>a.kind==='sale_refund'))
 const balances=finance.records;check('fund record stores before and after amounts',balances.every(r=>r.after_cents-r.before_cents===r.delta_cents))
 r=await req('/api/admin/seller-finance',{},cookie);check('admin finance review returns real sale and wallet rows',r.status===200&&r.data.sales.some(s=>s.orderId===o)&&r.data.wallets.some(w=>w.seller_id===sellerId))
 r=await post('/api/seller/finance/requests',{...deposit,requestKey:randomUUID()})
 const pdfRequest=r.data.id
 const pdfPath=`/api/seller/finance/requests/${pdfRequest}/receipt`
 const uploadPdf=body=>req(pdfPath,{method:'POST',body,headers:{'Content-Type':'application/pdf'}},seller)
 r=await uploadPdf(png);check('PNG bytes declared as PDF are rejected',r.status===400,r)
 const pdf=Buffer.from('%PDF-1.4\n%%EOF\n')
 r=await uploadPdf(pdf);check('seller uploads PDF proof',r.status===200,r)
 const pdfReview=(await req('/api/admin/seller-finance',{},cookie)).data.requests.find(request=>request.id===pdfRequest)
 check('PDF proof is available for admin review',pdfReview?.status==='awaiting_review'&&pdfReview.receiptId,pdfReview)
 const receiptUrl='/api/seller/finance/receipts/'+pdfReview.receiptId
 const download=await req(receiptUrl,{},cookie)
 check('admin downloads original PDF as an attachment',download.status===200&&download.data===pdf.toString()&&download.headers.get('content-disposition')?.startsWith('attachment;'),download.status)
 r=await req(receiptUrl,{},buyer);check('buyer cannot download seller PDF',r.status===404,r)

 const extra={sellerNetwork:true,network:'TRON (TRC20)',address:'test-tron-address',usdRate:'1',qr:{type:'image/png',data:png.toString('base64')}}
 r=await post('/api/admin/payment-wallets/USDT',extra,cookie,'PUT');check('admin saves second USDT network',r.status===200&&r.data.wallet?.hasQr,r)
 r=await post('/api/admin/payment-wallets/USDT',{...extra,network:'test'},cookie,'PUT');check('admin cannot duplicate the primary network',r.status===409,r)
 r=await post('/api/admin/payment-wallets/TON',{...extra,network:'TON',address:'test-ton-address'},cookie,'PUT');check('admin saves an additional coin',r.status===200,r)
 r=await req('/api/admin/payment-wallets',{},cookie)
 check('admin can manage the extra network independently',r.data.wallets.some(w=>w.coin==='USDT'&&w.address==='test-address')&&r.data.networkWallets.some(w=>w.coin==='USDT'&&w.network===extra.network),r)
 r=await req('/api/seller/finance',{},seller)
 check('seller sees both USDT networks and the new coin',r.data.depositWallets.filter(w=>w.coin==='USDT').length===2&&r.data.depositWallets.some(w=>w.coin==='TON'&&w.network==='TON'),r)
 const extraWallet=(await req(walletPath+'?'+new URLSearchParams({network:extra.network}),{},seller)).data
 check('selected network returns its own destination and QR',extraWallet.address===extra.address&&extraWallet.qrUrl?.startsWith('data:image/png;base64,'),extraWallet)
 r=await post('/api/seller/finance/requests',{...deposit,requestKey:randomUUID(),paymentNetwork:extra.network,walletVersion:extraWallet.version})
 const extraId=r.data.id
 finance=(await req('/api/seller/finance',{},seller)).data
 check('deposit locks the selected network',r.status===201&&finance.requests.some(q=>q.id===extraId&&q.network===extra.network&&q.address===extra.address),r)

}
