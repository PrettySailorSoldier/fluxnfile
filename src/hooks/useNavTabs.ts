import { useCallback, useMemo } from 'react';
import { useUpdateWorkflowSettings, useUserPreferences } from '@/hooks/useUserPreferences';
import { cacheNavTabs, readCachedNavTabs, resolveNavTabs } from '@/lib/navConfig';

/** The signed-in user's bottom-bar tabs (per user, saved with their preferences). */
export function useNavTabs() {
  const { data: prefs, isSuccess } = useUserPreferences();
  const update = useUpdateWorkflowSettings();

  const tabIds = useMemo(() => {
    const saved = prefs?.workflow_settings?.navTabs;
    if (saved) return resolveNavTabs(saved);
    // Until preferences arrive, show the last-known layout instead of flashing the defaults
    return (!isSuccess && readCachedNavTabs()) || resolveNavTabs(undefined);
  }, [prefs, isSuccess]);

  const setTabs = useCallback(
    async (ids: string[]) => {
      const clean = resolveNavTabs(ids);
      cacheNavTabs(clean);
      await update.mutateAsync({ navTabs: clean });
    },
    [update]
  );

  return { tabIds, setTabs, isSaving: update.isPending };
}
