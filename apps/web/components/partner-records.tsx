import { publicData } from "../lib/content";
export async function PartnerRecords() {
  const partners = await publicData("partners");
  if (!partners?.length)
    return (
      <div className="notice">
        No signed partner records have been supplied. This is an invitation to
        discuss opportunities, not a partner endorsement.
      </div>
    );
  return (
    <div className="three-grid">
      {partners.map((p: any) => (
        <article key={p.name}>
          {p.logo && (
            <img
              src={p.logo}
              alt={`${p.name} approved logo`}
              width={160}
              height={80}
            />
          )}
          <h3>{p.name}</h3>
          <span className="badge">Confirmed · display permission recorded</span>
          <p>{p.description}</p>
        </article>
      ))}
    </div>
  );
}
