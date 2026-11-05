import { DefaultJWT } from "next-auth/jwt"

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    accessToken?: string
  }
}
