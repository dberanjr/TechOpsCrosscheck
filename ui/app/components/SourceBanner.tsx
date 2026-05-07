import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { MessageContainer } from "@dynatrace/strato-components/content";
import { useCrosscheck } from "../context/CrosscheckContext";
import { formatDate } from "../lib/formatters";

export interface SourceBannerProps {
  onUploadRequest: () => void;
}

function formatTime(date: Date | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export const SourceBanner = ({ onUploadRequest }: SourceBannerProps) => {
  const {
    activeSource,
    centralRows,
    centralStatus,
    centralLoadedAt,
    uploadedRows,
    uploadedAt,
    switchSource,
  } = useCrosscheck();

  const centralAvailable =
    centralStatus === "ok" && (centralRows?.length ?? 0) > 0;
  const uploadedAvailable = (uploadedRows?.length ?? 0) > 0;

  if (centralStatus === "loading" && !uploadedAvailable) {
    return (
      <MessageContainer variant="neutral">
        <MessageContainer.Title>Loading TechOps application list…</MessageContainer.Title>
      </MessageContainer>
    );
  }

  if (activeSource === "uploaded" && centralAvailable) {
    return (
      <MessageContainer variant="primary">
        <MessageContainer.Title>
          Central lookup is now available with {centralRows?.length ?? 0} rows
        </MessageContainer.Title>
        <MessageContainer.Description>
          <Flex gap={8} flexFlow="wrap" alignItems="center">
            <Text>
              You are currently using the uploaded table ({uploadedRows?.length ?? 0} rows,
              uploaded {formatDate(uploadedAt)}).
            </Text>
            <Button onClick={() => switchSource("central")} variant="emphasized" color="primary">
              Switch to central
            </Button>
            <Button onClick={() => switchSource("uploaded")} variant="default">
              Stay on uploaded
            </Button>
          </Flex>
        </MessageContainer.Description>
      </MessageContainer>
    );
  }

  if (activeSource === "central") {
    return (
      <MessageContainer variant="success">
        <MessageContainer.Title>
          Using central TechOps lookup ({centralRows?.length ?? 0} rows, last loaded{" "}
          {formatTime(centralLoadedAt)})
        </MessageContainer.Title>
        {uploadedAvailable && (
          <MessageContainer.Actions>
            <Button onClick={() => switchSource("uploaded")} variant="default">
              Switch to uploaded table
            </Button>
          </MessageContainer.Actions>
        )}
      </MessageContainer>
    );
  }

  if (activeSource === "uploaded") {
    return (
      <MessageContainer variant="warning">
        <MessageContainer.Title>
          Using uploaded table ({uploadedRows?.length ?? 0} rows, uploaded{" "}
          {formatDate(uploadedAt)})
        </MessageContainer.Title>
        <MessageContainer.Actions>
          <Button onClick={onUploadRequest} variant="default">
            Replace uploaded table
          </Button>
          {centralAvailable && (
            <Button onClick={() => switchSource("central")} variant="default">
              Switch to central lookup
            </Button>
          )}
        </MessageContainer.Actions>
      </MessageContainer>
    );
  }

  return (
    <MessageContainer variant="warning">
      <MessageContainer.Title>No TechOps application list available</MessageContainer.Title>
      <MessageContainer.Description>
        Crosscheck needs the TechOps application taxonomy to render. The central
        lookup did not return rows for your identity. Upload a CSV or TSV with
        the columns AppCI, ApplicationName, Tier, Director.
      </MessageContainer.Description>
      <MessageContainer.Actions>
        <Button onClick={onUploadRequest} variant="emphasized" color="primary">
          Upload TechOps table
        </Button>
      </MessageContainer.Actions>
    </MessageContainer>
  );
};
