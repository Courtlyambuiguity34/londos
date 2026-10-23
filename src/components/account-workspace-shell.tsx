import type {ReactNode} from "react";
import {PortalShell,type PortalLink} from "@/components/portal-shell";
export function AccountWorkspaceShell({kind,title,subtitle,currentPath,children,banner,extraLinks=[]}:{kind:"shopkeeper"|"landlord";title:string;subtitle:string;currentPath:string;children:ReactNode;banner?:ReactNode;extraLinks?:PortalLink[]}){
 const links:PortalLink[]=kind==="shopkeeper"?[{href:"/shopkeeper/applications",label:"Applications"},{href:"/shopkeeper/invitations",label:"Invitations"},{href:"/shopkeeper/team",label:"Teams"},{href:"/security",label:"Security"}]:[{href:"/landlord/applications",label:"Applications"},{href:"/landlord/rent",label:"Rent desk"},{href:"/security",label:"Security"}];
 return <PortalShell kind={kind} title={title} subtitle={subtitle} currentPath={currentPath} links={[...links,...extraLinks]} banner={banner}>{children}</PortalShell>;
}
