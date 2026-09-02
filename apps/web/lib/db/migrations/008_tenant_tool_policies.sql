-- Agent Tool Platform — tenant tool policies (TASK 25, tenant-tool-policies.md §3)
-- Apply after 007_tool_call_records.sql.
-- Per (tenant, tool): OFF | ON | APPROVAL. Geen rij = spec-default
-- (fail-closed, backwards compatible). Rijen zijn operator-data: er is geen
-- write-pad vanuit tools of modellen.

CREATE TABLE IF NOT EXISTS tenant_tool_policies (
  tenant_id    UUID NOT NULL REFERENCES prospect_tenants(tenant_id) ON DELETE CASCADE,
  tool_id      TEXT NOT NULL,
  policy       TEXT NOT NULL CHECK (policy IN ('OFF','ON','APPROVAL')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tenant_tool_policies_pk PRIMARY KEY (tenant_id, tool_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_tool_policies_tool
  ON tenant_tool_policies(tool_id);

DROP TRIGGER IF EXISTS tenant_tool_policies_set_updated_at ON tenant_tool_policies;
CREATE TRIGGER tenant_tool_policies_set_updated_at BEFORE UPDATE ON tenant_tool_policies
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
