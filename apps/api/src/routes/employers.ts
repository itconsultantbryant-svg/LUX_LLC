import type { FastifyPluginAsync } from 'fastify';
import { Access, denied, withSession } from '../modules/security/access.js';
import { IdentityError } from '../modules/identity/service.js';
import { sessionToken } from './identity.js';

export const employerRoutes: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof IdentityError)
      return reply.code(error.statusCode).send({ message: error.message });
    app.log.error(
      { errorType: error instanceof Error ? error.name : 'Unknown' },
      'Employer portal failed',
    );
    return reply.code(503).send({ message: 'Employer information is temporarily unavailable.' });
  });
  app.get('/api/employer/portal', async (request) =>
    withSession(app.ctx.pool, app.ctx.env, sessionToken(request), async (access: Access) => {
      access.mfa();
      const organizations = await access.client.query<{ id: string; name: string; role: string }>(
        `SELECT o.id,o.name,m.role
           FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id
          WHERE m.user_id=$1 AND m.status='active' AND o.kind='employer' AND o.status='approved'
            AND m.role IN ('employer_admin','organization_admin')
          ORDER BY o.name`,
        [access.actor.id],
      );
      if (!organizations.rowCount) throw denied();
      const employees = await access.client.query(
        `SELECT e.id,e.organization_id,e.employee_reference,e.department,e.status,e.created_at,
                u.display_name,concat('••••',right(u.phone_e164,4)) AS masked_phone
           FROM employer_employees e JOIN users u ON u.id=e.user_id
          WHERE e.organization_id=ANY($1::uuid[])
          ORDER BY e.status='active' DESC,e.created_at DESC`,
        [organizations.rows.map((organization) => organization.id)],
      );
      return { organizations: organizations.rows, employees: employees.rows };
    }),
  );
};
