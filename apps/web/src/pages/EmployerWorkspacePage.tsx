import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Feedback } from '../components/Feedback';
import { Icon } from '../components/icons/Icon';
import { apiGet } from '../lib/api';

type Employee = {
  id: string;
  employee_reference: string;
  department: string | null;
  status: string;
  display_name: string | null;
  masked_phone: string;
};
type Portal = {
  organizations: Array<{ id: string; name: string; role: string }>;
  employees: Employee[];
};
type Screen = 'dashboard' | 'employees' | 'contribute' | 'transactions';

export function EmployerWorkspacePage({ screen }: { screen: Screen }) {
  const [portal, setPortal] = useState<Portal>();
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const refresh = async () => setPortal(await apiGet<Portal>('/api/employer/portal'));
  useEffect(() => {
    void refresh().catch((reason: Error) => setError(reason.message));
  }, []);

  const employees = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return portal?.employees ?? [];
    return (portal?.employees ?? []).filter((employee) =>
      [
        employee.display_name,
        employee.employee_reference,
        employee.department,
        employee.masked_phone,
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(needle)),
    );
  }, [portal, query]);

  const organizationName = portal?.organizations[0]?.name ?? 'Employer workspace';
  const title =
    screen === 'employees'
      ? 'Employees'
      : screen === 'contribute'
        ? 'Contribute'
        : screen === 'transactions'
          ? 'Transactions'
          : 'Employer Portal';
  return (
    <section className="workspace flow-layout">
      <header className="page-heading">
        <div>
          <p className="eyebrow">
            <Icon name="building" size={15} /> Employer
          </p>
          <h1>{title}</h1>
          <p>{organizationName}</p>
        </div>
      </header>
      {error && (
        <Feedback kind="error" title={error}>
          <button className="btn btn--ghost" onClick={() => void refresh()}>
            Retry
          </button>
        </Feedback>
      )}
      {!portal ? (
        <Feedback kind="loading" title="Loading employer workspace…" />
      ) : (
        <>
          {screen === 'dashboard' && (
            <>
              <div className="reference-stat-grid">
                <article className="reference-stat reference-stat--0">
                  <strong>{portal.employees.length}</strong>
                  <span>Employees</span>
                </article>
                <article className="reference-stat reference-stat--1">
                  <strong>
                    {portal.employees.filter((employee) => employee.status === 'active').length}
                  </strong>
                  <span>Active</span>
                </article>
                <article className="reference-stat reference-stat--2">
                  <strong>{portal.organizations.length}</strong>
                  <span>Organizations</span>
                </article>
              </div>
              <div className="reference-action-grid">
                <Link to="/employer/employees">
                  <Icon name="users" size={18} />
                  <span>
                    <strong>Employees</strong>
                    <small>View authorized employees</small>
                  </span>
                </Link>
                <Link to="/employer/contribute">
                  <Icon name="credit-card" size={18} />
                  <span>
                    <strong>Contribute</strong>
                    <small>Manage employer funding</small>
                  </span>
                </Link>
              </div>
            </>
          )}
          {screen === 'employees' && (
            <article className="panel">
              <label htmlFor="employee-search">Search employees</label>
              <input
                id="employee-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, reference, or department"
              />
              {!employees.length ? (
                <p className="muted">No employees found.</p>
              ) : (
                <ul className="activity-list">
                  {employees.map((employee) => (
                    <li key={employee.id}>
                      <div>
                        <strong>{employee.display_name ?? employee.employee_reference}</strong>
                        <small>
                          {employee.department ?? 'No department'} · {employee.masked_phone}
                        </small>
                      </div>
                      <span
                        className={`badge badge--${employee.status === 'active' ? 'success' : 'pending'}`}
                      >
                        {employee.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          )}
          {screen === 'contribute' && (
            <Feedback kind="unavailable" title="Employer funding is not configured">
              <p>Contributions will be available after an employer funding source is approved.</p>
            </Feedback>
          )}
          {screen === 'transactions' && (
            <Feedback kind="unavailable" title="No employer transaction feed is available yet" />
          )}
        </>
      )}
    </section>
  );
}
