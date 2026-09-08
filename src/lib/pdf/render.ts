import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { Ao1Document } from "./ao1";
import { loadAo1Bundle } from "./ao1-data";
import { FundMemoDocument, type FundPdfData } from "./funds";
import { LetterDocument, type LetterPdfData } from "./letter";

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
