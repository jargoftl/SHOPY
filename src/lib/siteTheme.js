export const siteThemes = [
 {id:'mono',name:'Black & white',accent:'#171717',soft:'#f3f3f3'},
 {id:'red',name:'Red & white',accent:'#b42332',soft:'#fff4f5'},
 {id:'green',name:'Green & white',accent:'#176244',soft:'#f0f8f3'},
]
export const normalizeTheme=value=>siteThemes.some(theme=>theme.id===value)?value:'mono'
export function readSiteTheme(){try{return normalizeTheme(localStorage.getItem('shopfy-theme'))}catch{return 'mono'}}
export function applySiteTheme(value){const theme=normalizeTheme(value);document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme='light';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',siteThemes.find(item=>item.id===theme).accent);return theme}
