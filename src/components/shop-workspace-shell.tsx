import type { ReactNode } from "react";
import Link from "next/link";
import { PortalShell } from "@/components/portal-shell";
import { ShopPublicLink } from "@/components/shop-public-link";
import { coreConfig } from "@/server/config";
type ShopRef={id:string;name:string;slug:string;role?:string};
export function ShopWorkspaceShell({shop,section,title,subtitle,children,published=false,banner}:{shop:ShopRef;section:"overview"|"catalogue"|"design"|"rent"|"analytics"|"costs";title:string;subtitle:string;children:ReactNode;published?:boolean;banner?:ReactNode}) {
 const base=`/shopkeeper/shops/${shop.id}`;
 const path=section==="overview"?base:`${base}/${section}`;
 const links=[{href:base,label:"Overview"},{href:`${base}/catalogue`,label:"Catalogue"},{href:`${base}/design`,label:"Design"},{href:`${base}/rent`,label:"Rent"},{href:"/shopkeeper",label:"All shops"},{href:"/shopkeeper/applications",label:"Applications"},{href:"/shopkeeper/team",label:"Team"}];
 return <PortalShell kind="shopkeeper" title={title} subtitle={subtitle} links={links} currentPath={path} banner={banner ?? <div className="portal-next-step portal-next-step--compact"><div><p className="portal-next-step__label">{shop.name}</p><strong>Share your storefront</strong><p>Customers can visit your public shop once it is published and eligible.</p></div><ShopPublicLink slug={shop.slug} absoluteBase={coreConfig().baseURL} published={published} compact /></div>}>{children}</PortalShell>;
}
