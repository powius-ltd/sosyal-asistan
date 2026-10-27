/**
 * Geçerli workspace. Faz 0'da sabit mock workspace; Faz 1'de oturumdaki kullanıcının
 * üyeliğinden (cookie/session) çözülür — bu yüzden async ve çağıranlar hep buradan alır.
 */

/** Tohumlu mock veri kümesinin (`lib/data/mock/**`) kullandığı workspace kimliği. */
export const MOCK_WORKSPACE_ID = "ws_mock_1";

/** Mock kaynakta oturumdaki kullanıcı (`PublishJob.approvedBy`); Faz 1'de gerçek oturum kullanıcısı. */
export const MOCK_USER_ID = "mock-user";

export async function getCurrentWorkspaceId(): Promise<string> {
  return MOCK_WORKSPACE_ID;
}
