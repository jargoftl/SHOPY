export default function ContentPlaceholder({className=''}){
 return <div role="progressbar" aria-label="Updating content" className={`min-w-0 space-y-3 py-6 motion-safe:animate-pulse ${className}`}><div className="h-4 w-1/3 rounded bg-gray-200"/><div className="h-20 w-full rounded-xl bg-gray-100"/><div className="h-4 w-2/3 rounded bg-gray-100"/></div>
}
