import React from "react";
import {
  BlockStack,
  Box,
  Button,
  DataTable,
  Divider,
  EmptyState,
  InlineStack,
  Text,
} from "@shopify/polaris";

export default function InventoryDataTable({
  headings,
  rows,
  emptyState,
  itemLabel,
  startIndex,
  endIndex,
  totalItems,
  currentPage,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
}) {
  return (
    <BlockStack gap="300">
      <InlineStack align="space-between">
        <Text tone="subdued">
          {totalItems === 0
            ? `0 ${itemLabel}`
            : `${startIndex}-${endIndex} of ${totalItems} ${itemLabel}`}
        </Text>
      </InlineStack>

      <Divider />

      {totalItems === 0 ? (
        <EmptyState
          heading={emptyState.heading}
          description={emptyState.description}
          action={emptyState.action}
        />
      ) : (
        <DataTable
          columnContentTypes={new Array(headings.length).fill("text")}
          headings={headings}
          rows={rows}
        />
      )}

      <Divider />

      <Box paddingBlockStart="200">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="bodySm" tone="subdued">
            Page {currentPage}
          </Text>
          <InlineStack gap="200">
            <Button disabled={!canGoPrevious} onClick={onPrevious}>
              Previous
            </Button>
            <Button disabled={!canGoNext} onClick={onNext}>
              Next
            </Button>
          </InlineStack>
        </InlineStack>
      </Box>
    </BlockStack>
  );
}
