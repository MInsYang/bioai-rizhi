"""Public backup evidence must not bypass the authenticated usage dashboard."""
import json

import pytest

from scripts.operations import TABLES, verified_public_counts, write_report


def snapshot_counts():
    return {**{table: 1 for table in TABLES}, 'companies': 134, 'schema_migrations': 16,
            'usage_analytics_state': 1, 'usage_web_events': 918273, 'usage_mcp_calls': 284773}


def test_public_manifest_and_workflow_stdout_omit_usage_counts(tmp_path, capsys):
    expected = snapshot_counts()
    restored = dict(expected)
    evidence = verified_public_counts(expected, restored)
    report = {'restore_drill': 'passed', 'checked_tables': list(TABLES), **evidence}
    destination = tmp_path / 'manifest.json'
    write_report(destination, report)
    artifact_text = destination.read_text()
    stdout = capsys.readouterr().out
    for text in [artifact_text, stdout]:
        data = json.loads(text)
        assert data['analytics_tables_verified'] is True
        assert data['expected_snapshot_counts']['companies'] == 134
        assert data['restored_counts']['schema_migrations'] == 16
        for field in ['expected_snapshot_counts', 'restored_counts']:
            assert not any(name.startswith('usage_') for name in data[field])
        assert '918273' not in text and '284773' not in text
    # Redaction must not change the internal counts used for verification.
    assert expected == restored == snapshot_counts()


@pytest.mark.parametrize('table', ['usage_analytics_state', 'usage_web_events', 'usage_mcp_calls'])
def test_private_usage_count_mismatch_still_rejects_restore(table, capsys):
    expected = snapshot_counts()
    restored = {**expected, table: expected[table] + 1}
    with pytest.raises(ValueError, match='table counts differ'):
        verified_public_counts(expected, restored)
    assert capsys.readouterr().out == ''


def test_missing_analytics_table_cannot_claim_success():
    expected = snapshot_counts()
    expected.pop('usage_mcp_calls')
    with pytest.raises(ValueError, match='table counts differ'):
        verified_public_counts(expected, dict(expected))


@pytest.mark.parametrize(('table', 'value'), [('companies', 0), ('schema_migrations', 7)])
def test_existing_core_table_gates_remain_required(table, value):
    expected = {**snapshot_counts(), table: value}
    with pytest.raises(ValueError, match='core tables are empty'):
        verified_public_counts(expected, dict(expected))


def test_zero_usage_counts_pass_without_publishing_zero_totals():
    expected = {**snapshot_counts(), 'usage_web_events': 0, 'usage_mcp_calls': 0}
    evidence = verified_public_counts(expected, dict(expected))
    assert evidence['analytics_tables_verified'] is True
    assert 'usage_web_events' not in evidence['expected_snapshot_counts']
    assert 'usage_mcp_calls' not in evidence['restored_counts']
