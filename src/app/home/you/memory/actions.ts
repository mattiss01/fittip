"use server";

import { revalidatePath } from "next/cache";

import type { MemoryActionDraft, MemoryActionState } from "./action-state";

import { MemoryValidationError } from "@/server/memory/memory-records";
import {
  createMemoryRepository,
  MemoryAuthenticationError,
  MemoryConflictError,
  MemoryPersistenceError,
  type MemoryStatusOperation,
} from "@/server/repositories/memory-repository";

const STATUS_OPERATIONS: MemoryStatusOperation[] = [
  "accept",
  "reject",
  "disable",
  "enable",
  "delete",
];

const RESULT_COPY: Record<string, string> = {
  create: "Memory saved.",
  edit: "Memory updated.",
  edit_and_accept: "Memory edited and accepted.",
  accept: "Memory accepted.",
  reject: "Proposal declined.",
  disable: "Memory disabled.",
  enable: "Memory enabled.",
  renew: "Review date updated.",
  delete: "Memory permanently deleted.",
};

export async function changeMemoryAction(
  previous: MemoryActionState,
  formData: FormData,
): Promise<MemoryActionState> {
  const operation = stringValue(formData.get("operation"));
  const itemId = stringValue(formData.get("itemId")) || undefined;
  const carriesDraft =
    operation === "create" ||
    operation === "edit" ||
    operation === "edit_and_accept";
  const draft = carriesDraft ? draftFrom(formData) : undefined;
  const resultState = (
    status: MemoryActionState["status"],
    message: string,
    preserveDraft: boolean,
  ): MemoryActionState => ({
    status,
    message,
    submission: previous.submission + 1,
    operation,
    itemId,
    draft: preserveDraft ? draft : undefined,
  });

  try {
    // Authorization is re-derived inside the repository on every call; the
    // form never supplies an owner.
    const repository = await createMemoryRepository();
    const expectedRevision = formData.get("expectedRevision");
    const content = formData.get("content");
    const reviewDate = formData.get("reviewDate");

    if (operation === "create") {
      await repository.create(
        formData.get("memoryType"),
        content,
        reviewDate,
        expectedRevision,
      );
    } else if (operation === "edit" || operation === "edit_and_accept") {
      await repository.edit(
        formData.get("itemId"),
        content,
        reviewDate,
        expectedRevision,
        operation === "edit_and_accept",
      );
    } else if (operation === "renew") {
      await repository.renew(
        formData.get("itemId"),
        reviewDate,
        expectedRevision,
      );
    } else if (STATUS_OPERATIONS.includes(operation as MemoryStatusOperation)) {
      await repository.transition(
        operation as MemoryStatusOperation,
        formData.get("itemId"),
        expectedRevision,
      );
    } else {
      throw new MemoryValidationError();
    }

    revalidatePath("/home/you/memory");
    return resultState(
      "saved",
      RESULT_COPY[operation] ?? "Memory saved.",
      false,
    );
  } catch (error) {
    if (error instanceof MemoryValidationError) {
      return resultState(
        "validation",
        "Enter between 1 and 1000 characters, and use a real review date. Nothing has been saved.",
        true,
      );
    }
    if (error instanceof MemoryConflictError) {
      return resultState(
        "conflict",
        "Memory changed in another tab. Reload before trying this change again.",
        true,
      );
    }
    if (error instanceof MemoryAuthenticationError) {
      return resultState(
        "session",
        "Your session ended. Sign in again before changing memory.",
        true,
      );
    }
    if (error instanceof MemoryPersistenceError) {
      return resultState(
        "error",
        "The memory change could not be confirmed. Reload and try again.",
        true,
      );
    }
    return resultState(
      "error",
      "The memory change could not be completed.",
      true,
    );
  }
}

function draftFrom(formData: FormData): MemoryActionDraft {
  return {
    memoryType: stringValue(formData.get("memoryType")),
    content: stringValue(formData.get("content")),
    reviewDate: stringValue(formData.get("reviewDate")),
  };
}

function stringValue(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}
