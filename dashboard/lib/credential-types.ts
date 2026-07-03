/**
 * Credential Types — Client-safe type definitions and metadata
 *
 * This file contains NO Node.js modules (fs, path, crypto).
 * Safe to import in "use client" components.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type CredentialType =
  | "apiKey"
  | "oauth2"
  | "basicAuth"
  | "bearerToken"
  | "customHeaders"
  | "httpDigestAuth"
  | "httpHeaderAuth"
  | "oAuth1Api"
  | "predefinedCredentialType";

export interface CredentialField {
  name: string;
  displayName: string;
  type: "string" | "password" | "boolean" | "number" | "options" | "json";
  default?: any;
  required?: boolean;
  options?: Array<{ name: string; value: string }>;
  placeholder?: string;
}

export interface CredentialDefinition {
  type: CredentialType;
  displayName: string;
  description: string;
  icon?: string;
  fields: CredentialField[];
  documentationUrl?: string;
}

export interface CredentialMetadata {
  id: string;
  name: string;
  type: CredentialType;
  createdAt: string;
  updatedAt: string;
  testedAt?: string;
  testStatus?: "success" | "error";
  testError?: string;
}

// ── Credential Type Definitions ───────────────────────────────────────────────

export const CREDENTIAL_DEFINITIONS: CredentialDefinition[] = [
  {
    type: "apiKey",
    displayName: "API Key",
    description: "Authenticate with an API key",
    fields: [
      { name: "apiKey", displayName: "API Key", type: "password", required: true, placeholder: "Enter your API key" },
      { name: "headerName", displayName: "Header Name", type: "string", default: "Authorization", placeholder: "e.g., X-API-Key" },
      { name: "headerPrefix", displayName: "Header Prefix", type: "string", default: "Bearer", placeholder: "e.g., Bearer " },
    ],
  },
  {
    type: "oauth2",
    displayName: "OAuth2",
    description: "Authenticate with OAuth2",
    fields: [
      { name: "accessToken", displayName: "Access Token", type: "password", required: true },
      { name: "refreshToken", displayName: "Refresh Token", type: "password" },
      { name: "tokenUrl", displayName: "Token URL", type: "string", placeholder: "https://provider.com/oauth/token" },
      { name: "clientId", displayName: "Client ID", type: "string" },
      { name: "clientSecret", displayName: "Client Secret", type: "password" },
      { name: "scope", displayName: "Scope", type: "string", placeholder: "read write" },
    ],
  },
  {
    type: "basicAuth",
    displayName: "Basic Auth",
    description: "HTTP Basic Authentication",
    fields: [
      { name: "username", displayName: "Username", type: "string", required: true },
      { name: "password", displayName: "Password", type: "password", required: true },
    ],
  },
  {
    type: "bearerToken",
    displayName: "Bearer Token",
    description: "HTTP Bearer Token Authentication",
    fields: [
      { name: "token", displayName: "Token", type: "password", required: true, placeholder: "Enter bearer token" },
    ],
  },
  {
    type: "customHeaders",
    displayName: "Custom Headers",
    description: "Send custom HTTP headers",
    fields: [
      { name: "headers", displayName: "Headers (JSON)", type: "json", required: true, placeholder: '{"X-Custom-Header": "value"}' },
    ],
  },
];

export function getCredentialDefinition(type: CredentialType): CredentialDefinition | undefined {
  return CREDENTIAL_DEFINITIONS.find((d) => d.type === type);
}
