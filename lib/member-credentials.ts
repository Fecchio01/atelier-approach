import { prisma } from './db';
import { authenticateInternalUser } from './internal-auth';
import { hashPassword, verifyPassword } from './password';

export async function authenticateMember(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const credential = await prisma.memberCredential.findUnique({
    where: { email: normalizedEmail },
    include: { member: true }
  });

  if (credential) {
    if (!await verifyPassword(password, credential.passwordHash)) return null;
    return { id: credential.member.id, name: credential.member.name, email: credential.member.email };
  }

  return authenticateInternalUser(normalizedEmail, password);
}

export async function changeMemberPassword(member: { id: string; email: string }, currentPassword: string, newPassword: string) {
  const credential = await prisma.memberCredential.findUnique({ where: { memberId: member.id } });
  if (credential) {
    if (!await verifyPassword(currentPassword, credential.passwordHash)) return false;
  } else {
    const legacyMember = authenticateInternalUser(member.email, currentPassword);
    if (legacyMember?.id !== member.id) return false;
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.memberCredential.upsert({
    where: { memberId: member.id },
    create: { memberId: member.id, email: member.email.toLowerCase(), passwordHash },
    update: { passwordHash }
  });
  return true;
}
