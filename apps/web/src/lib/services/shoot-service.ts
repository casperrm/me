import { requirePermission } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { emitAuditEvent } from "@cedar/events";
import { AuthError } from "./auth-service";

async function assertClientInOrg(clientId: string, organizationId: string) {
  const client = await prisma.client.findFirst({ where: { id: clientId, organizationId } });
  if (!client) throw new AuthError("Client not found.");
  return client;
}

export interface CrewMember {
  name: string;
  role: string;
  contact?: string;
}

export interface ShotListItem {
  description: string;
  status: string;
}

// Section 11.2: shoot schedule, locations, contacts, crew, roles,
// equipment, permits/requirements, call sheet, shot list, product list,
// references, status. The list-shaped fields are stored as JSON — see
// the schema comment on Shoot for why.
export async function createShoot(params: {
  actorUserId: string;
  organizationId: string;
  clientId: string;
  title: string;
  projectId?: string;
  scheduledAt?: Date;
  location?: string;
  crew?: CrewMember[];
  equipment?: string[];
  permits?: string[];
  callSheetNotes?: string;
  shotList?: ShotListItem[];
  productList?: string[];
  references?: string[];
}) {
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: params.clientId,
  });
  await assertClientInOrg(params.clientId, params.organizationId);

  if (!params.title.trim()) throw new AuthError("Shoot title is required.");

  if (params.projectId) {
    const project = await prisma.project.findFirst({ where: { id: params.projectId, clientId: params.clientId } });
    if (!project) throw new AuthError("Project not found for this client.");
  }

  const shoot = await prisma.shoot.create({
    data: {
      clientId: params.clientId,
      projectId: params.projectId,
      title: params.title.trim(),
      scheduledAt: params.scheduledAt,
      location: params.location || undefined,
      crew: JSON.stringify(params.crew ?? []),
      equipment: JSON.stringify(params.equipment ?? []),
      permits: JSON.stringify(params.permits ?? []),
      callSheetNotes: params.callSheetNotes || undefined,
      shotList: JSON.stringify(params.shotList ?? []),
      productList: JSON.stringify(params.productList ?? []),
      references: JSON.stringify(params.references ?? []),
    },
  });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "shoot.created",
    resourceType: "Shoot",
    resourceId: shoot.id,
    clientId: params.clientId,
    result: "SUCCESS",
    changeSet: { title: shoot.title },
  });

  return shoot;
}

const SHOOT_STATUSES = ["PLANNED", "CONFIRMED", "COMPLETED", "CANCELED"] as const;
export type ShootStatus = (typeof SHOOT_STATUSES)[number];

export async function setShootStatus(params: {
  actorUserId: string;
  organizationId: string;
  shootId: string;
  status: ShootStatus;
}) {
  if (!SHOOT_STATUSES.includes(params.status)) throw new AuthError("Invalid shoot status.");

  const shoot = await prisma.shoot.findUnique({ where: { id: params.shootId }, include: { client: true } });
  if (!shoot || shoot.client.organizationId !== params.organizationId) {
    throw new AuthError("Shoot not found.");
  }

  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: shoot.clientId,
  });

  const updated = await prisma.shoot.update({ where: { id: shoot.id }, data: { status: params.status } });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "shoot.status_changed",
    resourceType: "Shoot",
    resourceId: shoot.id,
    clientId: shoot.clientId,
    result: "SUCCESS",
    changeSet: { before: { status: shoot.status }, after: { status: params.status } },
  });

  return updated;
}
