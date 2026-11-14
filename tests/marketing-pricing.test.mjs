import { test } from 'node:test'
import assert from 'node:assert/strict'
import { marketingCoinAmount, validMarketingRate } from '../dist-server/marketingPlans.js'
test('marketing quotes retain exact cents and round coin units upward',()=>{
 assert.equal(marketingCoinAmount(19999,'1'),'199.99')
 assert.equal(marketingCoinAmount(66666,'60000'),'0.011111')
 assert.equal(marketingCoinAmount(29999,'3000'),'0.09999667')
 assert.equal(marketingCoinAmount(1,'30000'),'0.00000034')
 assert.equal(marketingCoinAmount(1,'0.5'),'0.02')
 assert.equal(marketingCoinAmount(1000000000000,'0.00000001'),'1000000000000000000')
})
test('only positive plain decimal conversion rates are accepted',()=>{
 for(const value of ['0','','-1','NaN','Infinity','1e5','.1','0001','0.000000001'])assert.equal(validMarketingRate(value),false,value)
 for(const value of ['1','0.5','60000','0.00000001','123.12345678'])assert.equal(validMarketingRate(value),true,value)
})
