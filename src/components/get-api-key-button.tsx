"use client";

import { useState } from "react";
import KeyClaimModal from "./key-claim-modal";

export default function GetApiKeyButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-interactive-primary text-interactive-primary-text rounded-md font-medium hover:bg-interactive-primary-hover transition-colors"
      >
        Get API Key
      </button>
      <KeyClaimModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
