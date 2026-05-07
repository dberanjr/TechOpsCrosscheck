import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph } from "@dynatrace/strato-components/typography";
import { SavedPivotsPanel } from "../components/SavedPivotsPanel";

export const SavedPivots = () => {
  return (
    <Flex flexDirection="column" padding={32} gap={16}>
      <Flex flexDirection="column" gap={4}>
        <Heading level={1}>Saved pivots</Heading>
        <Paragraph>
          Pivot dates and windows you have saved. Load any of them back into
          the Crosscheck dashboard, or edit and delete entries.
        </Paragraph>
      </Flex>
      <SavedPivotsPanel />
    </Flex>
  );
};
