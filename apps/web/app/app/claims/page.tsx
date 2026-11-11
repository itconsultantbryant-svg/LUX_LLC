"use client";
import { useState } from "react";
import Link from "next/link";
import {
  useData,
  useWorkspace,
  DataBoundary,
  Empty,
  Status,
  money,
  date,
} from "../../../components/workspace";
export default function ClaimList() {
  const [search, setSearch] = useState(""),
    [state, setState] = useState("");
  const { org } = useWorkspace();
  const { data, error, loading, reload } = useData(
    "/claims?" +
      new URLSearchParams({
        ...(search ? { search } : {}),
        ...(state ? { state } : {}),
      }),
  );
  return (
    <>
      <div className="app-title">
        <div>
          <h1>{org.type === "INSURER" ? "Claims queue" : "Claims"}</h1>
          <p>Scoped to your active facility–insurer relationships.</p>
        </div>
        {org.type === "FACILITY" && org.permissions.includes("claims") && (
          <Link href="/app/claims/new" className="button">
            + Prepare a claim
          </Link>
        )}
      </div>
      <div className="toolbar">
        <input
          aria-label="Search claim reference"
          placeholder="Search claim reference…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Filter claim status"
          value={state}
          onChange={(e) => setState(e.target.value)}
        >
          <option value="">All statuses</option>
          {[
            "DRAFT",
            "SUBMITTED",
            "VALIDATING",
            "AWAITING_REVIEW",
            "NEEDS_INFORMATION",
            "APPROVED",
            "PARTIALLY_APPROVED",
            "REJECTED",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <span className="subtle">
          {loading
            ? "Refreshing…"
            : `${data?.data?.length || 0} visible records`}
        </span>
      </div>
      <DataBoundary loading={loading} error={error} retry={reload}>
        {data?.data?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Claim reference</th>
                  <th>Counterparty</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Approved</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((c: any) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={"/app/claims/" + c.id}>{c.reference}</Link>
                    </td>
                    <td>{org.type === "FACILITY" ? c.insurer : c.facility}</td>
                    <td>
                      <Status value={c.state} />
                    </td>
                    <td>{money(c.submitted_minor, c.currency)}</td>
                    <td>{money(c.approved_minor, c.currency)}</td>
                    <td>{date(c.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !loading && <Empty />
        )}
      </DataBoundary>
    </>
  );
}
