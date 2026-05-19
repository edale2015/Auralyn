---
name: auralyn-frontend-tab
description: Load when adding a new tab to MasterRuleMapPage or any similar tabbed page in the Auralyn admin UI. Triggers on phrases like "add a tab", "new tab", "MasterRuleMapPage", "Rule Catalog tab", "Context Health tab", "12th tab", "13th tab", "tab trigger", "tab content", "TabsTrigger", "TabsContent".
---

# Adding a New Tab to MasterRuleMapPage

`client/src/pages/MasterRuleMapPage.tsx` is already 1,740+ lines with
12 tabs. Adding a new tab follows a strict pattern.

## The pattern

### Step 1: Build the tab content as a separate component

NEVER add tab content inline in `MasterRuleMapPage.tsx`. Make a component:

```tsx
// client/src/components/<TabName>Panel.tsx
export function <TabName>Panel() {
  return (
    <div className="space-y-4">
      {/* tab content */}
    </div>
  );
}
```

### Step 2: Import and add the tab trigger

```tsx
<TabsTrigger value="<tab-key>">{/* Tab Label */}</TabsTrigger>
```

### Step 3: Add the tab content panel

```tsx
<TabsContent value="<tab-key>" className="space-y-4">
  <<TabName>Panel />
</TabsContent>
```

### Step 4: If the tab needs backend data, add a route

```tsx
const { data, isLoading } = useQuery({
  queryKey: ["<feature>", "<viewName>"],
  queryFn: () => fetch("/api/<feature>/<endpoint>").then(r => r.json()),
});
```

## What NOT to do

- **Do not add tab content inline** in `MasterRuleMapPage.tsx`.
- **Do not duplicate state between tabs.**
- **Do not bypass auth.**
- **Do not introduce a new UI library.**
- **Do not add a tab without a route registered** if the tab fetches data.

## Verification

```bash
npx tsc --noEmit
npm run lint
```
