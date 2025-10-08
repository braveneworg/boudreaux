// lib/prisma-adapter.ts
import { PrismaAdapter } from "@auth/prisma-adapter"
import { PrismaClient } from "@prisma/client"
import type { Adapter } from "next-auth/adapters"

interface ExtendedUserData {
  termsAndConditions?: boolean
}

const prisma = new PrismaClient()

export function CustomPrismaAdapter(p: PrismaClient): Adapter {
  const baseAdapter = PrismaAdapter(p);

  return {
    ...baseAdapter,
    createUser: async (data) => {
      const user = await p.user.create({
        data: {
          ...data,
        },
      })
      return {
      id: user.id,
      name: user.name,
      email: user.email!,
      emailVerified: user.emailVerified,
      image: user.image,
      }
    },

    // Override getUser to return extra fields
    getUser: async (id) => {
      const user = await prisma.user.findUnique({
        where: { id },
      })
      return user
    },

    // Override getUserByEmail to return extra fields
    getUserByEmail: async (email) => {
      const user = await prisma.user.findUnique({
        where: { email },
      })
      return user
    },

    // Override getUserByAccount to return extra fields
    getUserByAccount: async (provider_providerAccountId) => {
      const account = await prisma.account.findUnique({
        where: { provider_providerAccountId },
        select: { user: true },
      })
      return account?.user ?? null
    },

    // Override updateUser to allow updating extra fields
    updateUser: async (data) => {
      const { id, ...updateData } = data
      const user = await prisma.user.update({
        where: { id },
        data: updateData,
      })
      return user
    },
  }
}

// Export the prisma instance
export { prisma }