from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config import logger, supabase
from services.clinic_knowledge_service import (
    process_pending_clinic_knowledge_sync_jobs,
    sync_clinic_knowledge_for_clinic,
)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Normalize clinic knowledge into services, service_facts, and faq_chunks.")
    parser.add_argument("--clinic-id", action="append", dest="clinic_ids", help="Sync one clinic id. Can be provided multiple times.")
    parser.add_argument("--all-clinics", action="store_true", help="Sync every clinic in the current Supabase project.")
    parser.add_argument("--pending-only", action="store_true", help="Process queued pending/failed sync jobs only.")
    parser.add_argument("--limit", type=int, default=25, help="Max pending jobs to process when --pending-only is used.")
    return parser


async def _fetch_all_clinics() -> list[dict]:
    def _query():
        result = supabase.table("clinics").select("id, organization_id, industry").order("created_at").execute()
        return result.data or []

    return await asyncio.to_thread(_query)


async def _main() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    if args.pending_only:
        processed = await process_pending_clinic_knowledge_sync_jobs(limit=max(1, int(args.limit)))
        logger.info("[CLINIC KNOWLEDGE SCRIPT] processed_pending_jobs=%s", processed)
        return 0

    target_clinics: list[dict] = []
    if args.all_clinics:
        target_clinics = await _fetch_all_clinics()
    elif args.clinic_ids:
        target_clinics = [{"id": clinic_id} for clinic_id in args.clinic_ids]
    else:
        parser.error("Choose one of --pending-only, --all-clinics, or --clinic-id.")

    for target in target_clinics:
        clinic_id = str(target.get("id") or "").strip()
        organization_id = str(target.get("organization_id") or "").strip() or None
        industry_type = str(target.get("industry") or "dental").strip() or "dental"
        if not clinic_id:
            continue
        logger.info(
            "[CLINIC KNOWLEDGE SCRIPT] syncing clinic_id=%s organization_id=%s industry=%s",
            clinic_id,
            organization_id or "-",
            industry_type,
        )
        await sync_clinic_knowledge_for_clinic(
            clinic_id,
            organization_id=organization_id,
            industry_type=industry_type,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
