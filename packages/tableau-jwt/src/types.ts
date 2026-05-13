/**
 * Scopes accepted by Tableau Cloud for embedded content.
 *
 * Use the smallest set sufficient for the page:
 *  - `<TableauViz>`:           ["tableau:views:embed"]
 *  - `<TableauPulse>`:         ["tableau:insights:embed"]
 *  - `<TableauAuthoringViz>`:  ["tableau:views:embed_authoring", "tableau:views:embed"]
 *
 * For pages that mix viz + pulse, include both scopes in ONE token.
 */
export type TableauScope =
  | "tableau:views:embed"
  | "tableau:views:embed_authoring"
  | "tableau:insights:embed";

export interface TableauJwtConfig {
  /** Connected App Client ID (UUID). */
  clientId: string;
  /** Connected App Secret ID (UUID). */
  secretId: string;
  /** Connected App Secret Value (sensitive). */
  secretValue: string;
}

export interface MintParams {
  /** Tableau user identity (typically email). Must be Tableau-known. */
  sub: string;
  /** One or more scopes for the embed page. */
  scopes: readonly TableauScope[];
  /** Tenant identifier exposed to workbooks via USERATTRIBUTE("TenantId"). */
  tenantId: string;
  /** Optional Region attribute (USERATTRIBUTE("Region")). */
  region?: "NA" | "EMEA" | "APAC";
  /** Optional AccountId attribute (USERATTRIBUTE("AccountId")). */
  accountId?: string;
  /** Optional Tableau group memberships. */
  groups?: readonly string[];
  /** Tableau Cloud on-demand access claim. */
  onDemandAccess?: boolean;
  /** Override TTL in seconds (≤ 600). Defaults to 600. */
  ttlSeconds?: number;
}
