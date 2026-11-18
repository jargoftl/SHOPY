import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeTheme,siteThemes,readSiteTheme} from '../src/lib/siteTheme.js'
test('old dark preferences become a light black-and-white theme',()=>{
 for(const value of ['dark','light',null,'unknown'])assert.equal(normalizeTheme(value),'mono')
 for(const theme of siteThemes)assert.equal(normalizeTheme(theme.id),theme.id)
 globalThis.localStorage={getItem(){throw new Error('storage blocked')}}
 assert.equal(readSiteTheme(),'mono');delete globalThis.localStorage
})
test('all three primary button colors meet WCAG AA contrast against white',()=>{
 const luminance=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0)
 assert.equal(siteThemes.length,3)
 for(const theme of siteThemes)assert.ok(1.05/(luminance(theme.accent)+.05)>=4.5,theme.name)
})
