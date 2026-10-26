import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/icons/Icon';
import { apiGet } from '../lib/api';
import './ReferencePortal.css';

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

export function EmployerPage() {
  const [searchParams] = useSearchParams();
  const [portal, setPortal] = useState<Portal>();
  const [error, setError] = useState('');
  const screen = searchParams.get('screen') ?? 'dashboard';
  useEffect(() => {
    let active = true;
    void apiGet<Portal>('/api/employer/portal')
      .then((data) => active && setPortal(data))
      .catch((reason: Error) => active && setError(reason.message));
    return () => {
      active = false;
    };
  }, []);
  const metrics = useMemo(
    () =>
      [
        ['Employees', portal?.employees.length],
        ['Active', portal?.employees.filter((employee) => employee.status === 'active').length],
        ['Inactive', portal?.employees.filter((employee) => employee.status === 'inactive').length],
        ['Organizations', portal?.organizations.length],
      ] as const,
    [portal],
  );
  const title =
    screen === 'employees'
      ? 'Employees'
      : screen === 'transactions'
        ? 'Employer contribution history'
        : screen === 'contribute'
          ? 'Send employer contribution'
          : 'Employer portal';
  const subtitle =
    screen === 'contribute'
      ? 'Contribution funding is not enabled until an authorized employer funding source is configured.'
      : 'Employee records are limited to the authorized employer workspace.';
  return (
    <section className="reference-portal reference-workspace">
      <Link to="/dashboard" className="reference-back">
        ← Back
      </Link>
      <header className="reference-portal__heading">
        <span className="reference-portal__heading-icon">
          <Icon name="building" size={16} />
        </span>
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </header>
      {screen === 'dashboard' && (
        <div className="reference-stat-grid">
          {metrics.map(([label, value], index) => (
            <article className={`reference-stat reference-stat--${index}`} key={label}>
              <strong>{portal ? value : '—'}</strong>
              <span>{label}</span>
            </article>
          ))}
        </div>
      )}
      {screen === 'contribute' && (
        <p className="reference-notice">
          <Icon name="shield-check" size={14} /> No contribution action is shown until the employer
          funding source and atomic ledger workflow are configured.
        </p>
      )}
      <article className="reference-card reference-workspace__table">
        <div className="reference-card__title">
          <h2>
            {screen === 'transactions'
              ? 'No employer contribution records'
              : 'Registered employees'}
          </h2>
          <Link className="reference-action" to="/account/security">
            Organization access
          </Link>
        </div>
        {error ? (
          <p className="reference-error" role="alert">
            {error}
          </p>
        ) : !portal ? (
          <p className="reference-empty">Loading authorized employee records…</p>
        ) : screen === 'transactions' ? (
          <p className="reference-empty">
            No employer-scoped contribution history is available yet.
          </p>
        ) : portal.employees.length === 0 ? (
          <p className="reference-empty">
            No employees are registered for this employer workspace.
          </p>
        ) : (
          <div className="reference-rows">
            {portal.employees.map((employee) => (
              <div key={employee.id}>
                <span>
                  <strong>{employee.display_name ?? employee.employee_reference}</strong>
                  <small>
                    {employee.employee_reference} · {employee.department ?? 'No department'} ·{' '}
                    {employee.masked_phone}
                  </small>
                </span>
                <em
                  className={`reference-tag reference-tag--${employee.status === 'active' ? 'success' : 'warning'}`}
                >
                  {employee.status}
                </em>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
