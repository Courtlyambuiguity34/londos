"use client";
import {useEffect,useMemo,useState} from "react";
import {useRouter} from "next/navigation";
export type CommandItem={href:string;label:string;keywords?:string};
export function WorkspaceCommandPalette({items}:{items:CommandItem[]}){
 const router=useRouter();const [open,setOpen]=useState(false);const [query,setQuery]=useState("");
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();setOpen(v=>!v);setQuery("");}if(e.key==="Escape")setOpen(false);};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey)},[]);
 const matches=useMemo(()=>items.filter(x=>`${x.label} ${x.keywords??""} ${x.href}`.toLowerCase().includes(query.toLowerCase().trim())).slice(0,12),[items,query]);
 const go=(href:string)=>{setOpen(false);router.push(href)};
 return <><button type="button" className="portal-search-trigger" onClick={()=>setOpen(true)} aria-label="Search workspace">Search <kbd>⌘K</kbd></button>{open?<div className="command-palette" role="dialog" aria-modal="true" aria-label="Jump to workspace page"><button className="command-palette__backdrop" type="button" aria-label="Close search" onClick={()=>setOpen(false)}/><div className="command-palette__panel"><label htmlFor="workspace-jump">Jump to…</label><input id="workspace-jump" autoFocus value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&matches[0])go(matches[0].href)}} placeholder="Search pages…"/><ul>{matches.map(x=><li key={x.href}><button type="button" onClick={()=>go(x.href)}><strong>{x.label}</strong><span>{x.href}</span></button></li>)}{!matches.length?<li>No matching pages</li>:null}</ul></div></div>:null}</>;
}
