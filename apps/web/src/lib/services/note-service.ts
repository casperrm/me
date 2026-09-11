import { requirePermission } from "@cedar/auth";
import { prisma } from "@cedar/db";
import { emitAuditEvent } from "@cedar/events";
import { AuthError } from "./auth-service";

async function assertClientInOrg(clientId: string, organizationId: string) {
  const client = await prisma.client.findFirst({ where: { id: clientId, organizationId } });
  if (!client) throw new AuthError("Client not found.");
  return client;
}

/**
 * `Note` (packages/db/prisma/schema.prisma) has existed since Phase 0 with
 * a real read path — `getPaginatedNotes` (client-relations-service.ts)
 * backs both the client detail page's preview card and the dedicated
 * `/clients/[id]/notes` list page — but no write path existed anywhere:
 * `prisma.note.create` had zero non-test call sites in the app. Same shape
 * as the client-creation gap this session (docs/specs/client-creation.md),
 * smaller in scope.
 */
export async function createNote(params: { actorUserId: string; organizationId: string; clientId: string; body: string }) {
  const client = await assertClientInOrg(params.clientId, params.organizationId);
  const membership = await requirePermission({
    userId: params.actorUserId,
    organizationId: params.organizationId,
    permission: "clients:write",
    clientId: client.id,
  });

  const body = params.body.trim();
  if (!body) throw new AuthError("Note body is required.");

  const note = await prisma.note.create({ data: { clientId: client.id, body } });

  await emitAuditEvent({
    organizationId: params.organizationId,
    actorType: "USER",
    actorId: membership.id,
    action: "note.created",
    resourceType: "Note",
    resourceId: note.id,
    clientId: client.id,
    result: "SUCCESS",
    changeSet: { body: note.body },
  });

  return note;
}
