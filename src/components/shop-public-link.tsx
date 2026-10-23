"use client";
import { useState } from "react";
import Link from "next/link";

export function ShopPublicLink({slug,shopName,published,absoluteBase,compact=false}:{slug:string;shopName?:string;published?:boolean;absoluteBase:string;compact?:boolean}) {
  const path = `/shops/${encodeURIComponent(slug)}`;
  const [status,setStatus] = useState("");
  async function copyLink() {
    const url = new URL(path,absoluteBase).href;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else {
        const input=document.createElement("textarea");
        input.value=url; input.readOnly=true; input.style.position="fixed"; input.style.left="-9999px";
        document.body.appendChild(input); input.select();
        const copied=document.execCommand("copy"); input.remove();
        if (!copied) throw new Error("Copy failed");
      }
      setStatus("Link copied");
    } catch { setStatus("Copy failed — select the link to copy it manually"); }
  }
  return <section className={compact?"shop-public-link shop-public-link--compact":"shop-public-link"} aria-label="Public shop link">
    {!compact && <><h2>Your public shop link</h2><p>Share {shopName || "your shop"} with customers using this address.</p>{published===false && <p className="notice">Your shop is not published. Visitors may not be able to open this link until your shop is eligible and published.</p>}</>}
    <div className="shop-public-link__row"><code className="shop-public-link__path">{new URL(path,absoluteBase).href}</code><div className="shop-public-link__actions"><Link href={path} prefetch={false}>Open shop</Link><button type="button" className="button button--small" onClick={copyLink}>Copy link</button></div></div>
    {status && <p role="status" className="shop-public-link__status">{status}</p>}
  </section>;
}
