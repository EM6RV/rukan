"use client";

import { useState } from "react";
import { IdentityPicker } from "@/components/dashboard/identity-picker";
import { SectionsEditor, type InitialSection } from "@/components/dashboard/sections-editor";
import { Card, CardBody } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import type { StoreTemplate } from "@/lib/constants";
import { STORE_FONTS, STORE_FONT_LABELS, type StoreFontKey } from "@/lib/store-fonts";
import { saveDesignAction } from "../settings/actions";
import { Footer, useSave } from "../settings/settings-shared";

type Media = { id: string; url: string } | null;
type Props = {
  writable: boolean; allTemplates: boolean; defaultTab: string; sections: InitialSection[];
  design: { template: StoreTemplate; primary: string; accent: string; fontKey: StoreFontKey; logo: Media };
};

export function DesignTabs(p: Props) {
  return (
    <Tabs
      defaultKey={p.defaultTab}
      items={[
        { key: "identity", label: "القالب والألوان والخط", content: <Identity {...p} /> },
        { key: "home", label: "ترتيب الصفحة الرئيسية", content: <SectionsEditor initial={p.sections} writable={p.writable} /> },
      ]}
    />
  );
}

function Identity({ design, writable, allTemplates }: Props) {
  const [template, setTemplate] = useState(design.template);
  const [primary, setPrimary] = useState(design.primary);
  const [accent, setAccent] = useState(design.accent);
  const [fontKey, setFontKey] = useState(design.fontKey);
  const [logo, setLogo] = useState(design.logo);
  const { save, pending, error } = useSave(saveDesignAction);
  return (
    <Card><CardBody>
      <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); save({ template, primaryColor: primary, accentColor: accent, fontKey, logoMediaId: logo?.id ?? null }); }}>
        <IdentityPicker logo={logo} onLogo={setLogo} template={template} onTemplate={setTemplate} primary={primary} accent={accent} onColors={(a, b) => { setPrimary(a); setAccent(b); }} allTemplates={allTemplates} />
        <div className="max-w-sm">
          <Select label="خط المتجر" value={fontKey} onChange={(e) => setFontKey(e.target.value as StoreFontKey)} hint="يتطبق على كل نصوص متجرك">
            {STORE_FONTS.map((f) => <option key={f} value={f}>{STORE_FONT_LABELS[f]}</option>)}
          </Select>
        </div>
        <Footer pending={pending} error={error} disabled={!writable} />
      </form>
    </CardBody></Card>
  );
}
