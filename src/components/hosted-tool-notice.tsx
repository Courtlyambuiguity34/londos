import Link from "next/link";

export function HostedToolNotice({
  title,
  description,
  backHref,
  backLabel,
}: {
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <section className="workspace-panel" aria-labelledby="hosted-tool-title">
      <h2 id="hosted-tool-title">{title}</h2>
      <p>{description}</p>
      <p>Your shop, catalogue and rent records are unaffected.</p>
      <Link className="button button--outline" href={backHref}>
        {backLabel}
      </Link>
    </section>
  );
}
