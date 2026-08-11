import { PrismaClient, RoleScope } from '@prisma/client';

const prisma = new PrismaClient();

const SYSTEM_ROLES = [
  { code: 'PLATFORM_ADMIN', name: 'Platform Administrator', scope: 'PLATFORM' as const },
  { code: 'COMPANY_ADMIN', name: 'Company Administrator', scope: 'COMPANY' as const },
  { code: 'HR_MANAGER', name: 'HR Manager', scope: 'COMPANY' as const },
  { code: 'RECRUITER', name: 'Recruiter', scope: 'COMPANY' as const },
  { code: 'HIRING_MANAGER', name: 'Hiring Manager', scope: 'COMPANY' as const },
  { code: 'INTERVIEWER', name: 'Interviewer', scope: 'COMPANY' as const },
  { code: 'VIEWER', name: 'Viewer', scope: 'COMPANY' as const },
];

const PERMISSIONS = [
  { code: 'company.read', name: 'Read company', resource: 'company', action: 'read' },
  { code: 'company.update', name: 'Update company', resource: 'company', action: 'update' },
  { code: 'company.manage_members', name: 'Manage members', resource: 'company', action: 'manage_members' },
  { code: 'users.read', name: 'Read users', resource: 'users', action: 'read' },
  { code: 'users.invite', name: 'Invite users', resource: 'users', action: 'invite' },
  { code: 'users.update', name: 'Update users', resource: 'users', action: 'update' },
  { code: 'users.suspend', name: 'Suspend users', resource: 'users', action: 'suspend' },
  { code: 'roles.read', name: 'Read roles', resource: 'roles', action: 'read' },
  { code: 'roles.manage', name: 'Manage roles', resource: 'roles', action: 'manage' },
  { code: 'departments.create', name: 'Create departments', resource: 'departments', action: 'create' },
  { code: 'departments.read', name: 'Read departments', resource: 'departments', action: 'read' },
  { code: 'departments.update', name: 'Update departments', resource: 'departments', action: 'update' },
  { code: 'departments.delete', name: 'Delete departments', resource: 'departments', action: 'delete' },
  { code: 'locations.create', name: 'Create locations', resource: 'locations', action: 'create' },
  { code: 'locations.read', name: 'Read locations', resource: 'locations', action: 'read' },
  { code: 'locations.update', name: 'Update locations', resource: 'locations', action: 'update' },
  { code: 'locations.delete', name: 'Delete locations', resource: 'locations', action: 'delete' },
  { code: 'jobs.create', name: 'Create jobs', resource: 'jobs', action: 'create' },
  { code: 'jobs.read', name: 'Read jobs', resource: 'jobs', action: 'read' },
  { code: 'jobs.update', name: 'Update jobs', resource: 'jobs', action: 'update' },
  { code: 'jobs.delete', name: 'Delete jobs', resource: 'jobs', action: 'delete' },
  { code: 'jobs.publish', name: 'Publish jobs', resource: 'jobs', action: 'publish' },
  { code: 'jobs.close', name: 'Close jobs', resource: 'jobs', action: 'close' },
  { code: 'jobs.archive', name: 'Archive jobs', resource: 'jobs', action: 'archive' },
  { code: 'jobs.approve', name: 'Approve jobs', resource: 'jobs', action: 'approve' },
  { code: 'jobs.assign', name: 'Assign jobs', resource: 'jobs', action: 'assign' },
  { code: 'jobs.manage_templates', name: 'Manage job templates', resource: 'jobs', action: 'manage_templates' },
  { code: 'jobs.manage_pipeline', name: 'Manage job pipeline', resource: 'jobs', action: 'manage_pipeline' },
  { code: 'jobs.manage_screening', name: 'Manage job screening', resource: 'jobs', action: 'manage_screening' },
  { code: 'jobs.manage_collaborators', name: 'Manage job collaborators', resource: 'jobs', action: 'manage_collaborators' },
  { code: 'jobs.view_sensitive', name: 'View sensitive job data', resource: 'jobs', action: 'view_sensitive' },
  { code: 'jobs.export', name: 'Export jobs', resource: 'jobs', action: 'export' },
  { code: 'candidates.read', name: 'Read candidates', resource: 'candidates', action: 'read' },
  { code: 'candidates.update', name: 'Update candidates', resource: 'candidates', action: 'update' },
  { code: 'candidates.create', name: 'Create candidates', resource: 'candidates', action: 'create' },
  { code: 'candidates.archive', name: 'Archive/restore candidates', resource: 'candidates', action: 'archive' },
  { code: 'candidates.block', name: 'Block/unblock candidates', resource: 'candidates', action: 'block' },
  { code: 'candidates.merge', name: 'Merge candidates', resource: 'candidates', action: 'merge' },
  { code: 'candidates.view_sensitive', name: 'View sensitive candidate data', resource: 'candidates', action: 'view_sensitive' },
  { code: 'candidates.delete', name: 'Delete candidates', resource: 'candidates', action: 'delete' },
  // Phase 2.2 — new candidate & application permissions
  { code: 'candidates.manage_tags', name: 'Manage candidate tags', resource: 'candidates', action: 'manage_tags' },
  { code: 'candidates.manage_notes', name: 'Manage candidate notes', resource: 'candidates', action: 'manage_notes' },
  { code: 'candidates.manage_company_profile', name: 'Manage company candidate profile', resource: 'candidates', action: 'manage_company_profile' },
  { code: 'applications.create', name: 'Create applications', resource: 'applications', action: 'create' },
  { code: 'applications.update', name: 'Update applications', resource: 'applications', action: 'update' },
  { code: 'applications.shortlist', name: 'Shortlist applications', resource: 'applications', action: 'shortlist' },
  { code: 'applications.reject', name: 'Reject applications', resource: 'applications', action: 'reject' },
  { code: 'applications.restore', name: 'Restore applications', resource: 'applications', action: 'restore' },
  { code: 'applications.withdraw', name: 'Withdraw applications', resource: 'applications', action: 'withdraw' },
  { code: 'applications.hire', name: 'Mark applications hired', resource: 'applications', action: 'hire' },
  { code: 'applications.assign', name: 'Assign applications', resource: 'applications', action: 'assign' },
  { code: 'applications.bulk_manage', name: 'Bulk manage applications', resource: 'applications', action: 'bulk_manage' },
  { code: 'applications.view_screening_answers', name: 'View screening answers', resource: 'applications', action: 'view_screening_answers' },
  { code: 'applications.add_notes', name: 'Add application notes', resource: 'applications', action: 'add_notes' },
  { code: 'applications.delete_notes', name: 'Delete application notes', resource: 'applications', action: 'delete_notes' },
  { code: 'applications.manage_flags', name: 'Manage application flags', resource: 'applications', action: 'manage_flags' },
  { code: 'pipeline.read', name: 'View pipeline board', resource: 'pipeline', action: 'read' },
  { code: 'pipeline.manage', name: 'Manage pipeline board', resource: 'pipeline', action: 'manage' },
  { code: 'applications.read', name: 'Read applications', resource: 'applications', action: 'read' },
  { code: 'applications.move', name: 'Move applications', resource: 'applications', action: 'move' },
  { code: 'applications.override_ai', name: 'Override AI', resource: 'applications', action: 'override_ai' },
  { code: 'interviews.create', name: 'Create interviews', resource: 'interviews', action: 'create' },
  { code: 'interviews.read', name: 'Read interviews', resource: 'interviews', action: 'read' },
  { code: 'interviews.update', name: 'Update interviews', resource: 'interviews', action: 'update' },
  { code: 'interviews.review', name: 'Review interviews', resource: 'interviews', action: 'review' },
  // Phase 2.3 — interview scheduling permissions
  { code: 'interviews.cancel', name: 'Cancel interviews', resource: 'interviews', action: 'cancel' },
  { code: 'interviews.reschedule', name: 'Reschedule interviews', resource: 'interviews', action: 'reschedule' },
  { code: 'interviews.complete', name: 'Complete interviews', resource: 'interviews', action: 'complete' },
  { code: 'interviews.record_result', name: 'Record interview results', resource: 'interviews', action: 'record_result' },
  { code: 'interviews.manage_participants', name: 'Manage interview participants', resource: 'interviews', action: 'manage_participants' },
  { code: 'notifications.send', name: 'Send notifications', resource: 'notifications', action: 'send' },
  { code: 'notifications.send_bulk', name: 'Send bulk notifications', resource: 'notifications', action: 'send_bulk' },
  { code: 'analytics.read', name: 'Read analytics', resource: 'analytics', action: 'read' },
  { code: 'reports.read', name: 'Read reports', resource: 'reports', action: 'read' },
  { code: 'reports.export', name: 'Export reports', resource: 'reports', action: 'export' },
  { code: 'settings.read', name: 'Read settings', resource: 'settings', action: 'read' },
  { code: 'settings.update', name: 'Update settings', resource: 'settings', action: 'update' },
  { code: 'audit.read', name: 'Read audit', resource: 'audit', action: 'read' },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  PLATFORM_ADMIN: PERMISSIONS.map(p => p.code),
  COMPANY_ADMIN: PERMISSIONS.map(p => p.code),
  HR_MANAGER: [
    'company.read', 'users.read', 'users.invite', 'roles.read',
    'departments.create', 'departments.read', 'departments.update',
    'locations.create', 'locations.read', 'locations.update',
    'jobs.create', 'jobs.read', 'jobs.update', 'jobs.delete',
    'jobs.publish', 'jobs.close', 'jobs.archive', 'jobs.approve',
    'jobs.assign', 'jobs.manage_templates', 'jobs.manage_pipeline',
    'jobs.manage_screening', 'jobs.manage_collaborators', 'jobs.view_sensitive',
    'jobs.export',
    'candidates.read', 'candidates.update', 'candidates.create',
    'candidates.archive', 'candidates.block', 'candidates.view_sensitive',
    'candidates.manage_tags', 'candidates.manage_notes', 'candidates.manage_company_profile',
    'applications.read', 'applications.create', 'applications.update',
    'applications.move', 'applications.shortlist', 'applications.reject',
    'applications.restore', 'applications.withdraw', 'applications.hire',
    'applications.assign', 'applications.bulk_manage',
    'applications.view_screening_answers', 'applications.add_notes', 'applications.delete_notes',
    'applications.manage_flags', 'applications.override_ai',
    'pipeline.read', 'pipeline.manage',
    'interviews.create', 'interviews.read', 'interviews.update',
    'interviews.cancel', 'interviews.reschedule', 'interviews.complete',
    'interviews.record_result', 'interviews.manage_participants', 'interviews.review',
    'notifications.send', 'notifications.send_bulk',
    'analytics.read', 'reports.read', 'reports.export',
    'settings.read',
  ],
  RECRUITER: [
    'company.read', 'users.read',
    'departments.read', 'locations.read',
    'jobs.create', 'jobs.read', 'jobs.update', 'jobs.close', 'jobs.archive',
    'jobs.manage_screening', 'jobs.manage_collaborators',
    'candidates.read', 'candidates.create', 'candidates.update', 'candidates.archive',
    'candidates.manage_tags', 'candidates.manage_notes', 'candidates.manage_company_profile',
    'applications.read', 'applications.create', 'applications.update',
    'applications.move', 'applications.shortlist',
    'applications.view_screening_answers', 'applications.add_notes', 'applications.delete_notes',
    'applications.manage_flags', 'applications.assign',
    'pipeline.read',
    'interviews.create', 'interviews.read', 'interviews.update',
    'interviews.cancel', 'interviews.reschedule', 'interviews.complete',
    'interviews.record_result', 'interviews.manage_participants',
    'notifications.send',
    'analytics.read', 'reports.read',
  ],
  HIRING_MANAGER: [
    'company.read', 'departments.read', 'locations.read',
    'jobs.read', 'jobs.update', 'jobs.approve',
    'candidates.read',
    'applications.read', 'applications.move',
    'applications.view_screening_answers', 'applications.add_notes',
    'pipeline.read',
    'interviews.read', 'interviews.review',
    'analytics.read',
  ],
  INTERVIEWER: [
    'company.read', 'interviews.read', 'interviews.update', 'interviews.record_result',
    'candidates.read', 'applications.read', 'pipeline.read',
  ],
  VIEWER: [
    'company.read', 'users.read', 'departments.read', 'locations.read',
    'jobs.read', 'candidates.read', 'applications.read',
    'pipeline.read', 'interviews.read',
    'analytics.read', 'reports.read',
  ],
};

async function main() {
  console.log('Seeding database...');
  console.log('');

  // Seed permissions
  let permissionsCreated = 0;
  let permissionsUpdated = 0;
  const permissionMap: Record<string, string> = {};

  for (const perm of PERMISSIONS) {
    const result = await prisma.permission.upsert({
      where: { code: perm.code },
      update: { name: perm.name, resource: perm.resource, action: perm.action },
      create: perm,
    });
    permissionMap[result.code] = result.id;
    permissionsCreated++;
  }
  console.log(`Permissions: ${permissionsCreated} created, ${permissionsUpdated} updated`);

  // Seed system roles
  let rolesCreated = 0;
  let rolesUpdated = 0;
  const roleMap: Record<string, string> = {};

  for (const role of SYSTEM_ROLES) {
    const result = await prisma.role.upsert({
      where: { code_scope: { code: role.code, scope: role.scope as RoleScope } },
      update: { name: role.name, isSystem: true },
      create: { code: role.code, name: role.name, scope: role.scope as RoleScope, isSystem: true },
    });
    roleMap[result.code] = result.id;
    if (result.createdAt === result.updatedAt) rolesCreated++;
    else rolesUpdated++;
  }
  console.log(`Roles: ${rolesCreated} created, ${rolesUpdated} updated`);

  // Seed role-permission mappings
  let rpCreated = 0;
  let rpSkipped = 0;

  for (const [roleCode, permissionCodes] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleMap[roleCode];
    if (!roleId) continue;

    for (const permCode of permissionCodes) {
      const permId = permissionMap[permCode];
      if (!permId) {
        console.warn(`  Warning: Permission ${permCode} not found for role ${roleCode}`);
        continue;
      }

      const existing = await prisma.rolePermission.findUnique({
        where: { roleId_permissionId: { roleId, permissionId: permId } },
      });

      if (!existing) {
        await prisma.rolePermission.create({ data: { roleId, permissionId: permId } });
        rpCreated++;
      } else {
        rpSkipped++;
      }
    }
  }
  console.log(`Role-Permission mappings: ${rpCreated} created, ${rpSkipped} already exist`);

  // Seed global skills
  const GLOBAL_SKILLS = [
    { normalizedName: 'communication', displayName: 'Communication', type: 'SOFT' as const },
    { normalizedName: 'teamwork', displayName: 'Teamwork', type: 'SOFT' as const },
    { normalizedName: 'problemsolving', displayName: 'Problem Solving', type: 'SOFT' as const },
    { normalizedName: 'leadership', displayName: 'Leadership', type: 'SOFT' as const },
    { normalizedName: 'timemanagement', displayName: 'Time Management', type: 'SOFT' as const },
    { normalizedName: 'criticalthinking', displayName: 'Critical Thinking', type: 'SOFT' as const },
    { normalizedName: 'adaptability', displayName: 'Adaptability', type: 'SOFT' as const },
    { normalizedName: 'projectmanagement', displayName: 'Project Management', type: 'SOFT' as const },
    { normalizedName: 'python', displayName: 'Python', type: 'TECHNICAL' as const },
    { normalizedName: 'javascript', displayName: 'JavaScript', type: 'TECHNICAL' as const },
    { normalizedName: 'typescript', displayName: 'TypeScript', type: 'TECHNICAL' as const },
    { normalizedName: 'sql', displayName: 'SQL', type: 'TECHNICAL' as const },
    { normalizedName: 'react', displayName: 'React', type: 'TECHNICAL' as const },
    { normalizedName: 'nodejs', displayName: 'Node.js', type: 'TECHNICAL' as const },
    { normalizedName: 'docker', displayName: 'Docker', type: 'TOOL' as const },
    { normalizedName: 'aws', displayName: 'AWS', type: 'TECHNICAL' as const },
    { normalizedName: 'git', displayName: 'Git', type: 'TOOL' as const },
    { normalizedName: 'agile', displayName: 'Agile', type: 'SOFT' as const },
    { normalizedName: 'datascience', displayName: 'Data Science', type: 'DOMAIN' as const },
    { normalizedName: 'machinelearning', displayName: 'Machine Learning', type: 'DOMAIN' as const },
    { normalizedName: 'english', displayName: 'English', type: 'LANGUAGE' as const },
  ];

  let skillsCreated = 0;
  let skillsSkipped = 0;

  for (const skill of GLOBAL_SKILLS) {
    const existing = await prisma.skill.findFirst({
      where: {
        normalizedName: skill.normalizedName,
        type: skill.type as any,
        companyId: null,
      },
    });
    if (!existing) {
      await prisma.skill.create({
        data: {
          normalizedName: skill.normalizedName,
          displayName: skill.displayName,
          type: skill.type as any,
          isGlobal: true,
        },
      });
      skillsCreated++;
    } else {
      skillsSkipped++;
    }
  }
  console.log(`Global skills: ${skillsCreated} created, ${skillsSkipped} already exist`);

  console.log('');
  console.log('Database seeding completed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
