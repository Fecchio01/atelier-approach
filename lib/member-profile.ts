import { prisma } from './db';

export type MemberProfileInput = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
};

export async function upsertMemberProfile(input: MemberProfileInput) {
  return prisma.memberProfile.upsert({
    where: { id: input.id },
    create: { ...input, avatarUrl: input.avatarUrl ?? null },
    update: { name: input.name, email: input.email, avatarUrl: input.avatarUrl ?? null }
  });
}

export async function ensureMemberProfile(input: Omit<MemberProfileInput, 'avatarUrl'>) {
  return prisma.memberProfile.upsert({
    where: { id: input.id },
    create: { ...input },
    update: { email: input.email }
  });
}

export async function getMemberProfiles() {
  return prisma.memberProfile.findMany({
    select: { id: true, name: true, email: true, avatarUrl: true },
    orderBy: { name: 'asc' }
  });
}
