import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { Ao1Document } from "./ao1";
import { loadAo1Bundle } from "./ao1-data";
import { FundMemoDocument, type FundPdfData } from "./funds";
import { LetterDocument, type LetterPdfData } from "./letter";
import { ClearanceDocument, type ClearancePdfData } from "./clearance";
import { DutyDocument, type DutyPdfData } from "./duty";
import { JournalDocument, type JournalPdfData } from "./journal";

export async function renderAdvancePdf(reportId: string): Promise<Buffer> {
  const { data } = await loadAo1Bundle(reportId);
  const element = createElement(Ao1Document, { data }) as never;
  const buf = await renderToBuffer(element);
  return Buffer.from(buf);
}

export async function renderFundPdf(data: FundPdfData): Promise<Buffer> {
  const element = createElement(FundMemoDocument, { data }) as never;
  const buf = await renderToBuffer(element);
  return Buffer.from(buf);
}

export async function renderLetterPdf(data: LetterPdfData): Promise<Buffer> {
  const element = createElement(LetterDocument, { data }) as never;
  const buf = await renderToBuffer(element);
  return Buffer.from(buf);
}

export async function renderClearancePdf(data: ClearancePdfData): Promise<Buffer> {
  const element = createElement(ClearanceDocument, { data }) as never;
  const buf = await renderToBuffer(element);
  return Buffer.from(buf);
}

export async function renderDutyPdf(data: DutyPdfData): Promise<Buffer> {
  const element = createElement(DutyDocument, { data }) as never;
  const buf = await renderToBuffer(element);
  return Buffer.from(buf);
}

export async function renderJournalPdf(data: JournalPdfData): Promise<Buffer> {
  const element = createElement(JournalDocument, { data }) as never;
  const buf = await renderToBuffer(element);
  return Buffer.from(buf);
}
