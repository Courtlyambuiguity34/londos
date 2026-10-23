import Link from "next/link";
import Image from "next/image";
import { Icon } from "./icon";
export function EmptyState({title,description,href="/search",action="Explore the mall",secondaryHref,secondaryAction,illustration}:{title:string;description:string;href?:string;action?:string;secondaryHref?:string;secondaryAction?:string;illustration?:string}){
 return <div className="empty-state empty-state--friendly"><div className="empty-state-icon" aria-hidden="true">{illustration?<Image src={illustration} alt="" width={160} height={120} unoptimized/>:<Icon name="shop"/>}</div><h2>{title}</h2><p>{description}</p><div className="empty-state-actions"><Link href={href} className="button">{action}<Icon name="arrow"/></Link>{secondaryHref&&secondaryAction?<Link href={secondaryHref} className="button button--outline">{secondaryAction}</Link>:null}</div></div>
}
export function MediaEmptyPrompt({href}:{href?:string}){return <div className="media-empty" role="group" aria-label="No photo yet"><span className="media-empty__mark" aria-hidden="true">▢</span><p>Add a photo</p><small>JPEG, PNG or WebP — clear pictures help customers understand your products.</small>{href?<Link href={href} className="text-button">Open catalogue images →</Link>:null}</div>}
