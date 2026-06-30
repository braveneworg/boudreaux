/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, ReactElement, SetStateAction } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { useFreeDownloadStatusQuery } from '@/app/hooks/use-free-download-status-query';
import { useSession } from '@/hooks/use-session';
import { checkGuestPurchaseAction } from '@/lib/actions/check-guest-purchase-action';
import { ALREADY_PURCHASED_ERROR } from '@/lib/constants';
import type { DigitalFormatType, FreeFormatType } from '@/lib/constants/digital-formats';
import type { FreeStatusResponse } from '@/lib/validation/bundle-download-schema';
import { downloadSchema, type DownloadFormSchemaType } from '@/lib/validation/download-schema';

type DialogStep =
  | 'download'
  | 'format-select'
  | 'free-format-select'
  | 'email-step'
  | 'purchase-checkout'
  | 'purchase-confirmed'
  | 'purchase-success'
  | 'returning-download';

interface AvailableFormat {
  formatType: DigitalFormatType;
  fileName: string;
}

interface UseDownloadDialogStateProps {
  artistName: string;
  premiumPrice?: number;
  releaseId: string;
  releaseTitle?: string;
  suggestedPrice?: number | null;
  hasPurchase?: boolean;
  purchasedAt?: Date | null;
  downloadCount?: number;
  resetInHours?: number | null;
  availableFormats?: AvailableFormat[];
  openOnMount?: boolean;
  children: ReactElement;
}

type SessionData = { user?: { email?: string | null; id?: string } } | null;

export interface UseDownloadDialogStateReturn {
  open: boolean;
  step: DialogStep;
  setStep: (step: DialogStep) => void;
  amountCents: number;
  guestAtCap: boolean;
  guestResetInHours: number | null;
  purchaseError: string | null;
  session: SessionData;
  availableFreeFormats: ReadonlyArray<FreeFormatType>;
  isFreeStatusPending: boolean;
  freeRadioDisabled: boolean;
  /** The email used for checkout — the guest-entered address, falling back to the session user's. */
  checkoutEmail: string | null | undefined;
  /** ISO timestamp when the free-download cap resets, or null when the cap is not the blocker. */
  freeCapResetsAtIso: string | null;
  form: ReturnType<typeof useForm<DownloadFormSchemaType>>;
  selectedOption: string | undefined;
  effectiveSuggestedPrice: number;
  displayAmount: string;
  handleSubmit: (data: DownloadFormSchemaType) => void;
  /** Resolve the guest email then route to the returning-download or purchase-checkout step. */
  handleEmailConfirm: (email: string) => Promise<void>;
  /** Branch on the checkout error: already-purchased shows the confirmed step, else surfaces the error. */
  handlePurchaseError: (msg: string) => void;
  handleOpenChange: (nextOpen: boolean) => void;
  handleDialogDownloadComplete: () => void;
}

const INITIAL_STEP: DialogStep = 'download';

/** Derived free-download state surfaced to the dialog's free-format step + radio gating. */
interface FreeDownloadState {
  availableFreeFormats: ReadonlyArray<FreeFormatType>;
  freeRadioDisabled: boolean;
  freeCapResetsAtIso: string | null;
}

/**
 * Derive the free-download view state from the `/free-status` query result:
 * the published free formats, whether the Free radio should be gated (FR-015),
 * and the cap-reset timestamp when the cap is the active blocker.
 */
const deriveFreeDownloadState = (freeStatus: FreeStatusResponse | undefined): FreeDownloadState => {
  const availableFreeFormats: ReadonlyArray<FreeFormatType> =
    freeStatus?.availableFreeFormats ?? [];
  return {
    availableFreeFormats,
    freeRadioDisabled: freeStatus !== undefined && availableFreeFormats.length === 0,
    freeCapResetsAtIso: freeStatus?.blockedReason === 'cap-reached' ? freeStatus.resetsAtIso : null,
  };
};

/**
 * Resolve the effective suggested price from the (optional) per-release suggestion,
 * falling back to the premium default, then to a hardcoded $5 floor.
 */
const resolveSuggestedPrice = (
  suggestedPrice: number | null,
  premiumPrice: number | undefined
): number => suggestedPrice ?? premiumPrice ?? 5;

/** Strip everything but digits/decimal from a raw amount string. */
const sanitizeAmount = (raw: string | undefined): string | undefined =>
  raw?.replace(/[^\d.]/g, '').trim();

/**
 * Compute the dollar string shown on the buy button from the raw (sanitized) amount
 * the user typed, falling back to the suggested price when the input is empty/NaN.
 */
const computeDisplayAmount = (
  rawAmount: string | undefined,
  effectiveSuggestedPrice: number
): string => {
  const parsed = rawAmount ? parseFloat(rawAmount) : NaN;
  return Number.isFinite(parsed)
    ? `$${parsed.toFixed(2)}`
    : `$${effectiveSuggestedPrice.toFixed(2)}`;
};

/** Resolve the checkout email: the guest-entered address, falling back to the session user's. */
const resolveCheckoutEmail = (
  customerEmail: string | null,
  session: SessionData
): string | null | undefined => customerEmail ?? session?.user?.email;

/** Discriminated result of validating the premium amount the user submitted. */
type PremiumAmountResult =
  | { ok: true; cents: number }
  | { ok: false; field: 'finalAmount'; message: string };

/**
 * Validate and convert the submitted premium amount into integer cents. Returns a
 * discriminated result so the caller can surface a field error without re-deriving it.
 */
const resolvePremiumCents = (
  finalAmount: string | undefined,
  effectiveSuggestedPrice: number
): PremiumAmountResult => {
  const cleanedAmount = sanitizeAmount(finalAmount);
  const dollars = cleanedAmount ? Number(cleanedAmount) : effectiveSuggestedPrice;
  /* v8 ignore start -- Zod resolver rejects non-numeric amounts before handleSubmit runs, so this guard is unreachable from tests */
  if (!Number.isFinite(dollars)) {
    return { ok: false, field: 'finalAmount', message: 'Amount must be a valid number' };
  }
  /* v8 ignore stop */
  const cents = Math.round(dollars * 100);
  if (cents < 50) {
    return { ok: false, field: 'finalAmount', message: 'Minimum amount is $0.50' };
  }
  return { ok: true, cents };
};

/** State setters + values the dialog step handlers close over. */
interface DialogHandlerDeps {
  form: ReturnType<typeof useForm<DownloadFormSchemaType>>;
  releaseId: string;
  session: SessionData;
  effectiveSuggestedPrice: number;
  setOpen: Dispatch<SetStateAction<boolean>>;
  setStep: Dispatch<SetStateAction<DialogStep>>;
  setCustomerEmail: Dispatch<SetStateAction<string | null>>;
  setAmountCents: Dispatch<SetStateAction<number>>;
  setGuestAtCap: Dispatch<SetStateAction<boolean>>;
  setGuestResetInHours: Dispatch<SetStateAction<number | null>>;
  setPurchaseError: Dispatch<SetStateAction<string | null>>;
}

interface DialogHandlers {
  handleSubmit: (data: DownloadFormSchemaType) => void;
  handleEmailConfirm: (email: string) => Promise<void>;
  handlePurchaseError: (msg: string) => void;
  handleOpenChange: (nextOpen: boolean) => void;
  handleDialogDownloadComplete: () => void;
}

/**
 * Build the download-dialog step handlers. Extracted from the main hook so each
 * step-transition decision (free vs premium, guest vs returning, error routing,
 * close-reset) lives in a small, separately-bounded callback.
 */
const useDownloadDialogHandlers = (deps: DialogHandlerDeps): DialogHandlers => {
  const { form, releaseId, session, effectiveSuggestedPrice } = deps;
  const { setOpen, setStep, setCustomerEmail, setAmountCents } = deps;
  const { setGuestAtCap, setGuestResetInHours, setPurchaseError } = deps;

  const handleSubmit = (data: DownloadFormSchemaType): void => {
    if (data.downloadOption !== 'premium-digital') {
      // Free download path — advance to a step where the user explicitly picks
      // which free formats (MP3 320Kbps and/or AAC) to bundle.
      // Feature: 007-free-digital-downloads (US1).
      setStep('free-format-select');
      return;
    }
    const result = resolvePremiumCents(data.finalAmount, effectiveSuggestedPrice);
    if (!result.ok) {
      form.setError(result.field, { message: result.message });
      return;
    }
    setAmountCents(result.cents);
    setStep(session?.user ? 'purchase-checkout' : 'email-step');
  };

  const handleEmailConfirm = async (email: string): Promise<void> => {
    setCustomerEmail(email);
    const status = await checkGuestPurchaseAction(email, releaseId);
    if (status.hasPurchase) {
      setGuestAtCap(status.atCap);
      setGuestResetInHours(status.resetInHours);
      setStep('returning-download');
    } else {
      setStep('purchase-checkout');
    }
  };

  const handlePurchaseError = (msg: string): void => {
    if (msg === ALREADY_PURCHASED_ERROR) {
      setStep('purchase-confirmed');
    } else {
      setPurchaseError(msg);
      setStep('download');
    }
  };

  // Memoised: handed to Radix `onOpenChange` and depended on by the
  // download-complete handler, so a stable identity avoids needless re-subscribes.
  // All deps below are referentially stable (useState setters + the RHF form ref).
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (nextOpen) return;
      form.reset();
      setStep(INITIAL_STEP);
      setCustomerEmail(null);
      setAmountCents(0);
      setGuestAtCap(false);
      setGuestResetInHours(null);
      setPurchaseError(null);
    },
    [
      form,
      setOpen,
      setStep,
      setCustomerEmail,
      setAmountCents,
      setGuestAtCap,
      setGuestResetInHours,
      setPurchaseError,
    ]
  );

  const handleDialogDownloadComplete = useCallback(
    () => handleOpenChange(false),
    [handleOpenChange]
  );

  return {
    handleSubmit,
    handleEmailConfirm,
    handlePurchaseError,
    handleOpenChange,
    handleDialogDownloadComplete,
  };
};

export const useDownloadDialogState = ({
  premiumPrice = 8,
  releaseId,
  suggestedPrice = null,
  hasPurchase = false,
  openOnMount = false,
}: UseDownloadDialogStateProps): UseDownloadDialogStateReturn => {
  const [open, setOpen] = useState(openOnMount);
  const [step, setStep] = useState<DialogStep>(INITIAL_STEP);
  const [customerEmail, setCustomerEmail] = useState<string | null>(null);
  const [amountCents, setAmountCents] = useState<number>(0);
  const [guestAtCap, setGuestAtCap] = useState(false);
  const [guestResetInHours, setGuestResetInHours] = useState<number | null>(null);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const { data: session } = useSession();

  // Pre-fetch the free-download status as soon as the dialog opens so the free
  // step has `availableFreeFormats` and the Free radio can be gated (FR-015).
  // Feature: 007-free-digital-downloads (US1).
  const { data: freeStatus, isPending: isFreeStatusPending } = useFreeDownloadStatusQuery(
    releaseId,
    { enabled: open }
  );
  const { availableFreeFormats, freeRadioDisabled, freeCapResetsAtIso } =
    deriveFreeDownloadState(freeStatus);

  // Auto-advance authenticated purchasers directly to format selection
  useEffect(() => {
    if (open && hasPurchase && session?.user && step === 'download') {
      setStep('format-select');
    }
  }, [open, hasPurchase, session, step]);

  const form = useForm<DownloadFormSchemaType>({
    resolver: zodResolver(downloadSchema),
    defaultValues: { downloadOption: undefined, finalAmount: '' },
  });

  const selectedOption = form.watch('downloadOption');
  const effectiveSuggestedPrice = resolveSuggestedPrice(suggestedPrice, premiumPrice);
  const displayAmount = computeDisplayAmount(
    sanitizeAmount(form.watch('finalAmount')),
    effectiveSuggestedPrice
  );
  const checkoutEmail = resolveCheckoutEmail(customerEmail, session);

  const handlers = useDownloadDialogHandlers({
    form,
    releaseId,
    session,
    effectiveSuggestedPrice,
    setOpen,
    setStep,
    setCustomerEmail,
    setAmountCents,
    setGuestAtCap,
    setGuestResetInHours,
    setPurchaseError,
  });

  return {
    open,
    step,
    setStep,
    amountCents,
    guestAtCap,
    guestResetInHours,
    purchaseError,
    session,
    availableFreeFormats,
    isFreeStatusPending,
    freeRadioDisabled,
    checkoutEmail,
    freeCapResetsAtIso,
    form,
    selectedOption,
    effectiveSuggestedPrice,
    displayAmount,
    ...handlers,
  };
};
