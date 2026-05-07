import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { MessageContainer } from "@dynatrace/strato-components/content";
import { CodeSnippet } from "@dynatrace/strato-components/content";
import {
  getCurrentUserDetails,
  getEnvironmentUrl,
} from "@dynatrace-sdk/app-environment";

const SUPPORT_EMAIL = "observability@united.com";
const TENANT_URL_FALLBACK = "https://ual.apps.dynatrace.com";

export type PermissionSurface = "page" | "card" | "inline";

export interface PermissionRequiredProps {
  scope: string;
  surface: PermissionSurface;
  reason?: string;
  onRetry?: () => void;
}

function safeUserDetails() {
  try {
    return getCurrentUserDetails();
  } catch {
    return { id: "", name: "", email: "" };
  }
}

function safeEnvUrl(): string {
  try {
    return getEnvironmentUrl() || TENANT_URL_FALLBACK;
  } catch {
    return TENANT_URL_FALLBACK;
  }
}

function buildMailtoUrl(scope: string): string {
  const user = safeUserDetails();
  const tenant = safeEnvUrl();
  const ts = new Date().toISOString();
  const lines = [
    "Hello Observability Team,",
    "",
    "TechOps Crosscheck is unable to load data because the following scope is missing.",
    "",
    `Missing scope: ${scope}`,
    `User: ${user.name || user.id || "unknown"} <${user.email || "unknown"}>`,
    `Tenant: ${tenant}`,
    `Timestamp (UTC): ${ts}`,
    "",
    "Please grant access. Thank you.",
  ];
  const subject = encodeURIComponent("TechOps Crosscheck access request");
  const body = encodeURIComponent(lines.join("\n"));
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

export const PermissionRequired = ({
  scope,
  surface,
  reason,
  onRetry,
}: PermissionRequiredProps) => {
  const mailto = buildMailtoUrl(scope);
  const defaultReason =
    "TechOps Crosscheck needs additional Dynatrace access to load this data.";

  const body = (
    <Flex flexDirection="column" gap={12} style={{ width: "100%" }}>
      <Text>{reason ?? defaultReason}</Text>
      <CodeSnippet showLineNumbers={false}>{scope}</CodeSnippet>
      <Flex gap={8} flexFlow="wrap">
        <Button
          as="a"
          href={mailto}
          variant="emphasized"
          color="primary"
        >
          Contact United Observability Team
        </Button>
        {onRetry && (
          <Button onClick={onRetry} variant="default">
            Retry
          </Button>
        )}
      </Flex>
    </Flex>
  );

  if (surface === "page") {
    return (
      <Flex
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        padding={32}
        style={{ minHeight: 320, width: "100%" }}
      >
        <Flex
          flexDirection="column"
          gap={16}
          style={{ maxWidth: 560, width: "100%" }}
        >
          <Heading level={2}>Permission required</Heading>
          {body}
        </Flex>
      </Flex>
    );
  }

  if (surface === "card") {
    return (
      <MessageContainer variant="warning">
        <MessageContainer.Title>Permission required</MessageContainer.Title>
        <MessageContainer.Description>{body}</MessageContainer.Description>
      </MessageContainer>
    );
  }

  return (
    <Flex flexDirection="column" gap={8} padding={12}>
      <Text textStyle="base-emphasized">Permission required</Text>
      {body}
    </Flex>
  );
};
