import test from 'node:test'
import assert from 'node:assert/strict'
import {validEstablishedDate} from '../dist-server/storeDates.js'
import {establishedLabel,formatStoreDate,formatTimestamp} from '../src/lib/storeDates.js'
test('store business dates are real calendar dates with explicit future labeling',()=>{
 for(const value of ['2024-02-29','2000-01-01','2099-12-31'])assert.ok(validEstablishedDate(value))
 for(const value of ['2023-02-29','2020-02-30','2024-13-01','2024-01-01T00:00:00Z','1899-01-01',{},null])assert.equal(validEstablishedDate(value),false)
 assert.equal(establishedLabel('2099-01-01','2026-11-19'),'Planned opening')
 assert.equal(establishedLabel('2020-01-01','2026-11-19'),'Store established')
 assert.equal(formatStoreDate('2020-01-01'),'1 January 2020')
 assert.ok(formatTimestamp('2020-01-01 23:30:00').includes('2 Jan 2020'))
})
