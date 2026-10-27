import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { UnmeasuredList } from "@/components/common/unmeasured-list";
import { UnmeasuredSummary } from "@/components/settings/unmeasured-summary";
import { AlertSettingsSection } from "@/components/settings/alert-settings-section";
import { ComplianceRegionField } from "@/components/settings/compliance-region-field";
import { ConnectionCards } from "@/components/settings/connection-cards";
import { AgentSettingsCard } from "@/components/settings/agent-settings-card";
import { AccountTypeField } from "@/components/settings/account-type-field";
import { ContentLanguageField } from "@/components/settings/content-language-field";
import { CostMeter } from "@/components/settings/cost-meter";
import { ShadowCostNote } from "@/components/settings/shadow-cost-note";
import { IntegrationStatusList } from "@/components/settings/integration-status";
import { MeasureCapCard } from "@/components/settings/measure-cap-card";
import { RunsTable } from "@/components/settings/runs-table";
import { SettingsSection } from "@/components/settings/settings-section";
import { WorkspaceForm } from "@/components/settings/workspace-form";
import { WORKSPACES_SECTION_ID } from "@/components/workspace/anchors";
import { CreateWorkspaceForm } from "@/components/workspace/create-workspace-form";
import { FirstStepsCard } from "@/components/workspace/first-steps-card";
import { WorkspaceList } from "@/components/workspace/workspace-list";
import { getPanelContext } from "@/lib/data";
import { DEFAULT_ACCOUNT_TYPE } from "@/lib/domain/account-type";
import { DEFAULT_COMPLIANCE_REGION } from "@/lib/domain/compliance";
import { DEFAULT_TIMEZONE } from "@/lib/format";
import { PLATFORM_LABEL, PLATFORMS } from "@/lib/domain/platform";
import { SETTINGS_PLAIN } from "@/lib/plain-language-account";
import { hasPlatformModule } from "@/lib/platforms/registry";
import { isOperatorMode } from "@/lib/workspace/operator-mode";
import { listOperatorWorkspaces } from "@/lib/workspace/registry";

export const metadata: Metadata = { title: "Ayarlar" };

/** "Son koşular" tablosunda gösterilecek koşu sayısı. */
const RECENT_RUNS = 15;

export default async function SettingsPage() {
  const { repo, wsId } = await getPanelContext();
  // Yönetici bilgisi (Apify maliyeti, anahtar durumu, koşu tablosu, tavanlar, komutlar) müşteriye görünmez: yalnız operatör modunda
  // okunur ve çizilir. Müşteri görünümünde ilgili okumalar hiç yapılmaz.
  const operator = isOperatorMode();
  const [workspace, connections, cost, recentRuns, unmeasured, alertSettings, competitors, operatorWorkspaces] = await Promise.all([
    repo.getWorkspace(wsId),
    repo.getConnections(wsId),
    operator ? repo.getCostSummary(wsId) : undefined,
    operator ? repo.listRuns(wsId, { limit: RECENT_RUNS }) : undefined,
    repo.listUnmeasured(wsId),
    repo.getAlertSettings(wsId),
    repo.listCompetitors(wsId),
    // `undefined` = çalışma alanı geçişi/oluşturma kapalı (Vercel, mock veri): ilgili kutular çizilmez.
    listOperatorWorkspaces(),
  ]);
  const currentWorkspace = operatorWorkspaces?.find((item) => item.id === wsId);
  const platformOptions = PLATFORMS.filter(hasPlatformModule).map((value) => ({ value, label: PLATFORM_LABEL[value] }));
  const timeZone = workspace?.timezone ?? DEFAULT_TIMEZONE;

  return (
    <>
      <PageHeader
        title="Ayarlar"
        description={
          operator
            ? "Hesap bağlantıları, entegrasyon anahtarları, aylık bütçe tavanları ve niş tanımı."
            : "Hesap bağlantıları, niş tanımı, hesap türü, yayın uyum bölgesi, içerik dili ve bildirimler."
        }
      />

      <div className="flex flex-col gap-6">
        {operatorWorkspaces !== undefined && competitors.length === 0 ? (
          <FirstStepsCard
            workspace={{ id: wsId, slug: currentWorkspace?.slug }}
            workspaceName={workspace?.name ?? currentWorkspace?.name ?? "Çalışma alanı"}
          />
        ) : null}

        <ConnectionCards accounts={connections.accounts} timeZone={timeZone} operator={operator} />

        {operator && cost ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <SettingsSection title="Aylık maliyet" description={`Bu ayın harcaması (${cost.month}). Tavan aşılırsa yeni koşu başlamaz.`}>
              <div className="flex flex-col gap-6">
                <CostMeter title="Apify (rakip ve pazar verisi)" bucket={cost.apify} />
                <CostMeter title="Claude ve transkript" bucket={cost.llm} />
                <ShadowCostNote shadow={cost.subscription.shadow} calls={cost.subscription.runs} />
              </div>
            </SettingsSection>

            <SettingsSection
              title="Entegrasyon durumu"
              description="Anahtar değerleri hiçbir yerde gösterilmez; yalnız tanımlı olup olmadığı (VAR/YOK)."
            >
              <IntegrationStatusList integrations={connections.integrations} />
            </SettingsSection>
          </div>
        ) : null}

        <SettingsSection
          title={operator ? SETTINGS_PLAIN.operatorSectionTitle : SETTINGS_PLAIN.sectionTitle}
          description={
            operator
              ? "Bütçe tavanları, konu eleğinin girdisi olan niş tanımı, hesap türü, yayın uyum bölgesi ve içerik dili."
              : "Niş tanımı, hesap türü, yayın uyum bölgesi ve içerik dili."
          }
        >
          <WorkspaceForm
            initial={{
              apifyMonthlyCapUsd: workspace?.apifyMonthlyCapUsd,
              llmMonthlyCapUsd: workspace?.llmMonthlyCapUsd,
              nicheBrief: workspace?.nicheBrief,
              timezone: timeZone,
            }}
            showCaps={operator}
          />
          <div className="mt-6 border-t pt-4">
            <AccountTypeField accountType={workspace?.accountType ?? DEFAULT_ACCOUNT_TYPE} operator={operator} />
          </div>
          <div className="mt-6 border-t pt-4">
            <ComplianceRegionField region={workspace?.complianceRegion ?? DEFAULT_COMPLIANCE_REGION} />
          </div>
          <div className="mt-6 border-t pt-4">
            <ContentLanguageField language={workspace?.contentLanguage} />
          </div>
        </SettingsSection>

        {operator ? (
          <MeasureCapCard capUsd={workspace?.measureMonthlyCapUsd} approvedAt={workspace?.measureCapApprovedAt} timeZone={timeZone} />
        ) : null}

        {operator && workspace ? <AgentSettingsCard workspace={workspace} timeZone={timeZone} /> : null}

        <AlertSettingsSection settings={alertSettings} />

        {operatorWorkspaces !== undefined ? (
          <div id={WORKSPACES_SECTION_ID}>
            <SettingsSection
              title="Çalışma alanları"
              description="Her marka/hesap ayrı çalışma alanıdır; veri, plan ve harcama birbirine karışmaz. Üst şeritten geçiş yaparsın; betiklerde --workspace= ile seçilir."
            >
              <div className="flex flex-col gap-6">
                <WorkspaceList workspaces={operatorWorkspaces} currentId={wsId} />
                <div className="flex flex-col gap-3 border-t pt-4">
                  <h3 className="text-sm font-medium">Yeni çalışma alanı</h3>
                  <CreateWorkspaceForm platforms={platformOptions} />
                </div>
              </div>
            </SettingsSection>
          </div>
        ) : null}

        {operator && recentRuns ? (
          <SettingsSection title="Son koşular" description="Paralı çağrılar: rezerve edilen ve mutabakat sonrası gerçek tutar.">
            <RunsTable runs={recentRuns.items} timeZone={timeZone} />
          </SettingsSection>
        ) : null}

        <SettingsSection
          title="Ölçülemeyenler"
          description={
            operator
              ? "Neyin neden ölçülemediği. Eksik veri saklanmaz, sebebiyle gösterilir."
              : "Şu an göremediğim şeyler ve nedeni. Eksik veriyi saklamam, söylerim."
          }
        >
          {/* Ham tablo (veritabanı ve sütun adları, yüzlerce tekrar eden satır) yalnız yönetici modunda; müşteri en çok 5 satırlık özet okur. */}
          {operator ? (
            <UnmeasuredList entries={unmeasured} timeZone={timeZone} />
          ) : (
            <UnmeasuredSummary entries={unmeasured} ownHandles={new Set(connections.accounts.map((account) => account.handle.toLowerCase()))} />
          )}
        </SettingsSection>
      </div>
    </>
  );
}
