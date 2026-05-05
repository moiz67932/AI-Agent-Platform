# Graph Report - Agent  (2026-05-05)

## Corpus Check
- 196 files · ~177,674 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1865 nodes · 3681 edges · 46 communities detected
- Extraction: 73% EXTRACTED · 27% INFERRED · 0% AMBIGUOUS · INFERRED: 983 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]

## God Nodes (most connected - your core abstractions)
1. `PatientState` - 243 edges
2. `AssistantTools` - 112 edges
3. `AssistantToolsTests` - 37 edges
4. `AgentServerManager` - 34 edges
5. `cn()` - 34 edges
6. `TurnTakingPolicyTests` - 33 edges
7. `preview_turn()` - 33 edges
8. `StreamingTurnTracker` - 32 edges
9. `_normalize_space()` - 31 edges
10. `CallLogger` - 31 edges

## Surprising Connections (you probably didn't know these)
- `_handle_post_booking_turn()` --calls--> `user_declined_anything_else()`  [INFERRED]
  agent.py → utils\agent_flow.py
- `TurnTimer` --uses--> `PatientState`  [INFERRED]
  agent.py → models\state.py
- `TurnTimer` --uses--> `CompletionLabel`  [INFERRED]
  agent.py → utils\turn_taking.py
- `TurnTimer` --uses--> `ExpectedUserSlot`  [INFERRED]
  agent.py → utils\turn_taking.py
- `TurnTimer` --uses--> `PolicyAction`  [INFERRED]
  agent.py → utils\turn_taking.py

## Communities

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (85): _handle_deterministic_confirmation_turn(), _infer_expected_slot_from_response(), datetime, Data models for the dental AI agent., contact_phase_allowed(), PatientState, Patient state management., Concise state snapshot for the dynamic system prompt. (+77 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (195): Execute a shell command over SSH and return stdout., Verify that the remote `.env` contains the expected values., Reload supervisor and nginx so the updated runtime starts serving traffic., _dispatch_rule_matches(), _is_duplicate_livekit_resource_error(), _normalize_config_json(), Telnyx number provisioning with LiveKit SIP dispatch setup., Create a LiveKit inbound trunk and SIP dispatch rule for the agent. (+187 more)

### Community 2 - "Community 2"
Cohesion: 0.02
Nodes (140): _build_missing_slot_prompt(), Fill obvious missing slots from recent caller context without waiting on the LLM, Fill obvious missing slots from recent caller context without waiting on the LLM, _seed_state_from_recent_context(), _build_tools(), _main(), _run_case(), cancel_appointment() (+132 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (48): addToRemoveQueue(), dispatch(), genId(), reducer(), toast(), useToast(), useAgent(), useAgents() (+40 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (53): _build_no_repeat_llm_instruction(), _needs_filler(), Preview whether policy would allow a filler for this utterance., Preview whether policy would allow a filler for this utterance., Enum, Verify has_date_reference / has_time_reference detect common phone-call     tim, TestDateTimeParsingFastPath, ConflictAfterSlotTests (+45 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (98): _build_parser(), _fetch_all_clinics(), _main(), _add_service_fact_seed(), _article_source_ref(), _build_answer(), _build_faq_rows(), _build_location_summary() (+90 more)

### Community 6 - "Community 6"
Cohesion: 0.03
Nodes (46): Record timestamp for label. Returns elapsed ms since t0 (or 0 for first mark)., Record timestamp for label. Returns elapsed ms since t0 (or 0 for first mark)., Return ms between two marks. None if either mark is missing., Return ms between two marks. None if either mark is missing., Emit one structured log line with all computed deltas., Emit one structured log line with all computed deltas., TurnTimer, _complete_state() (+38 more)

### Community 7 - "Community 7"
Cohesion: 0.03
Nodes (61): load_telnyx_config(), Async Telnyx REST client used by telephony services., Small async HTTP client for the Telnyx v2 REST API., Perform a JSON request against the Telnyx API with basic retries., Return a compact human-readable summary for a Telnyx error payload., Raised when the Telnyx API returns an error response., Runtime configuration for Telnyx integrations., Load Telnyx configuration from the environment. (+53 more)

### Community 8 - "Community 8"
Cohesion: 0.03
Nodes (52): AgentServerManager, _connect(), load_ssh_key(), normalize_key_path(), _parse_env_content(), Remote deployment manager for per-agent webhook and worker processes., Initialize the SSH-backed deployment manager., Return the remote directory for an agent deployment. (+44 more)

### Community 9 - "Community 9"
Cohesion: 0.05
Nodes (56): _build_post_phone_confirmation_prompt(), _caller_number_confirmation_message(), _choose_filler(), _closing_text_for_state(), entrypoint(), _entrypoint_impl(), _fetch_clinic_faq(), _fetch_clinic_knowledge_articles() (+48 more)

### Community 10 - "Community 10"
Cohesion: 0.05
Nodes (37): LoggingConfigTests, CallLogger, create_call_logger(), mask_phone(), CallLogger - Centralized Logging & Observability for LiveKit Voice Agent.  Thi, Mask phone number for safe logging.     Example: +13105551234 -> ***1234, Remove or mask sensitive data from payload before logging., Centralized call logging with dual-destination strategy:     - Cloud Logging: S (+29 more)

### Community 11 - "Community 11"
Cohesion: 0.08
Nodes (29): buildGeneratedKnowledgeArticles(), buildHoursKnowledgeBody(), buildPricingBody(), buildServicesOverviewBody(), defaultFullWorkingHours(), fromKnowledgeArticleRow(), fullToCompactWorkingHours(), normalizeServices() (+21 more)

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (20): AgentFlowTests, resolve_confirmation_intent must handle all common affirmations/negations., TestResolutionConfirmationIntent, TimeParsingTests, build_time_parse_candidates(), is_active_filler_event(), looks_like_delivery_follow_up_fragment(), looks_like_phone_input() (+12 more)

### Community 13 - "Community 13"
Cohesion: 0.1
Nodes (27): _build_fallback_context(), entrypoint(), get_agent_config(), get_livekit_agent_name(), _install_context_override(), load_agent_runtime_env(), _merge_nested_dict(), Thin wrapper over `agent.py` for per-tenant environment-driven config. (+19 more)

### Community 14 - "Community 14"
Cohesion: 0.12
Nodes (19): authMiddleware(), errorHandler(), next(), agentSecretAuth(), candidate_platform_base_urls(), check_platform_health(), create_or_reuse_test_agent(), find_existing_test_agents() (+11 more)

### Community 15 - "Community 15"
Cohesion: 0.13
Nodes (18): _FixedDateTime, now(), test_parse_day_after_tomorrow(), test_parse_next_saturday(), test_parse_ordinal_date_with_at_does_not_infer_time_from_day_number(), test_parse_ordinal_month_phrase(), test_parse_this_monday(), _convert_spoken_digits_for_email() (+10 more)

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (19): fetch_day_appointments(), Fetch ALL appointments for a date in ONE query.     Returns list of (start_time, check_slot_against_appointments(), get_cached_availability(), get_cached_day_appointments(), invalidate_slot_cache(), _make_cache_key(), _make_day_cache_key() (+11 more)

### Community 17 - "Community 17"
Cohesion: 0.13
Nodes (15): add(), create_azure_tts(), Azure TTS wrapper — Thin convenience wrapper around livekit-plugins-azure.  Th, Create an Azure TTS instance using the official LiveKit Azure plugin.      Arg, Pipeline module — Houses Urdu voice pipeline components.  The English pipeline, build_english_pipeline(), build_stt_keyterms_from_context(), build_urdu_pipeline() (+7 more)

### Community 18 - "Community 18"
Cohesion: 0.14
Nodes (11): IndustryProfile, Abstract base for industry profiles.  Every industry (dental, med_spa, hvac, res, Format the system prompt template with runtime values., build_dental_profile(), Dental industry profile.  Preserves 100% of the existing dental agent behavior, Industry profile system for multi-industry AI receptionist platform., build_med_spa_profile(), Med Spa / Aesthetics industry profile.  Handles a fundamentally different busi (+3 more)

### Community 19 - "Community 19"
Cohesion: 0.19
Nodes (9): getRawStatusesForOutcome(), isBookedAppointmentStatus(), matchAppointmentToCall(), normalizeAgentRecord(), normalizeCallOutcome(), normalizePhone(), safeDate(), serializeAppointment() (+1 more)

### Community 20 - "Community 20"
Cohesion: 0.16
Nodes (2): AgentRuntimeConfigTests, _find_function()

### Community 21 - "Community 21"
Cohesion: 0.16
Nodes (7): Latency tracking and performance monitoring utilities., Lightweight latency tracker for voice agent turns.     Logs structured timing d, Record a timestamp for a labeled event., Track whether filler was played or suppressed., Get elapsed time in ms for a label., Emit a single structured log line with all latency data., TurnMetrics

### Community 22 - "Community 22"
Cohesion: 0.23
Nodes (8): useCreateArticle(), useDeleteArticle(), useKnowledge(), useUpdateArticle(), importFromUrl(), reset(), startPolling(), stopPolling()

### Community 23 - "Community 23"
Cohesion: 0.24
Nodes (2): CalendarConnection, SupabaseCalendarStore

### Community 24 - "Community 24"
Cohesion: 0.44
Nodes (9): _build_parser(), candidate_platform_base_urls(), check_platform_health(), http_json(), main(), normalize_agent_id(), print_failure_logs(), verify_agent_health() (+1 more)

### Community 25 - "Community 25"
Cohesion: 0.31
Nodes (8): BaseModel, FindRelativeSlotsArgs, GetAvailableSlotsV2Args, Pydantic models for tool function arguments., Sanitize tool arguments - removes None, empty strings, and 'null' literals., _sanitize_tool_arg(), SearchClinicInfoArgs, UpdatePatientRecordArgs

### Community 26 - "Community 26"
Cohesion: 0.32
Nodes (7): _build_parser(), _main(), Poll an agent health endpoint until it becomes live., Poll the agent `/health` endpoint until it returns HTTP 200.      Params:, Create the CLI argument parser.      Returns:         Configured argument parser, Parse CLI args and print the verification result.      Returns:         None., verify_agent()

### Community 27 - "Community 27"
Cohesion: 0.25
Nodes (7): build_spoken_confirmation(), email_for_speech(), General formatting utilities for speech and display., Build a warm, human-sounding booking confirmation for TTS.     Pauses are creat, Format email address for TTS., format_phone_for_speech(), Format phone number for TTS with proper pacing.

### Community 28 - "Community 28"
Cohesion: 0.57
Nodes (4): _function(), _has_livekit_plugin_import(), LiveKitPluginImportTests, _parse()

### Community 29 - "Community 29"
Cohesion: 0.48
Nodes (5): _call_initiated_event(), test_parse_event_accepts_telnyx_data_envelope(), test_parse_event_accepts_telnyx_v1_top_level_event_envelope(), test_parse_event_accepts_telnyx_voice_metadata_event_envelope(), test_parse_event_normalizes_telnyx_v1_underscore_event_names()

### Community 31 - "Community 31"
Cohesion: 0.53
Nodes (4): global_exception_handler(), health(), lifespan(), root()

### Community 34 - "Community 34"
Cohesion: 0.5
Nodes (3): map_call_outcome(), Configuration and constants for the dental AI agent.  Contains all environment, Maps internal call results to DB-safe call_outcome enum values.     NEVER retur

### Community 35 - "Community 35"
Cohesion: 0.5
Nodes (2): Agent prompts and system instructions., Agent prompt templates.

### Community 36 - "Community 36"
Cohesion: 0.5
Nodes (3): __getattr__(), Service modules package.  Contains business logic services for: - Database op, Lazily expose common service helpers without importing every integration.

### Community 37 - "Community 37"
Cohesion: 0.83
Nodes (3): _load_platform_utils(), test_generate_subdomain_is_stable_and_safe(), test_mask_secret_redacts_middle()

### Community 38 - "Community 38"
Cohesion: 0.5
Nodes (3): __getattr__(), Utility modules for the dental AI agent., Lazily expose utility helpers without importing unrelated runtime config.

### Community 39 - "Community 39"
Cohesion: 0.67
Nodes (1): main()

### Community 42 - "Community 42"
Cohesion: 0.67
Nodes (2): LLM Function Tools package.  This package contains the AssistantTools class wi, # TODO: Import AssistantTools once created

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (1): Database package for platform schema and async helpers.

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (1): Open a Paramiko SSH connection with retry semantics.

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (1): Parse a simple dotenv file produced by `_render_env_file`.

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (1): Find an available Twilio voice number.

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (1): Purchase a Twilio number and configure its webhooks.

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (1): Update the Twilio voice webhook URL for an existing number.          When we r

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (1): Look up an already-owned Twilio incoming number by E.164 phone number.

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (1): Release a Twilio number from the account.

## Knowledge Gaps
- **444 isolated node(s):** `agent.py — Dental Voice AI Agent (Latency-Optimized, Instrumented)  Target lat`, `Record timestamp for label. Returns elapsed ms since t0 (or 0 for first mark).`, `Return ms between two marks. None if either mark is missing.`, `Emit one structured log line with all computed deltas.`, `Normalize SIP URI fragments to E.164 format.` (+439 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 20`** (14 nodes): `AgentRuntimeConfigTests`, `.test_agent_refresh_updates_running_instructions()`, `.test_agent_session_increases_max_tool_steps()`, `.test_agent_uses_supported_livekit_state_events()`, `.test_clinic_faq_prompt_context_is_index_only()`, `.test_interrupt_filler_forces_interruption()`, `.test_safe_say_sanitizes_clinic_pricing_before_tts()`, `.test_send_filler_keeps_filler_outside_chat_context_but_interruptible()`, `.test_stt_keyterms_include_clinic_and_med_spa_services()`, `.test_system_prompt_uses_booking_confirmation_wording_for_phone()`, `.test_worker_main_does_not_force_reset_root_logging()`, `_find_function()`, `test_agent_runtime_config.py`, `setUpClass()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (10 nodes): `CalendarConnection`, `SupabaseCalendarStore`, `.create_appointment()`, `.get_calendar_connection()`, `.get_clinic_phone_region()`, `.get_clinic_timezone()`, `.__init__()`, `.list_appointment_types()`, `supabase_calendar_store.py`, `supabase_calendar_store.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (4 nodes): `agent_prompts.py`, `Agent prompts and system instructions.`, `__init__.py`, `Agent prompt templates.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (3 nodes): `main()`, `opus_check.py`, `opus_check.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (3 nodes): `__init__.py`, `LLM Function Tools package.  This package contains the AssistantTools class wi`, `# TODO: Import AssistantTools once created`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (2 nodes): `__init__.py`, `Database package for platform schema and async helpers.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (1 nodes): `Open a Paramiko SSH connection with retry semantics.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (1 nodes): `Parse a simple dotenv file produced by `_render_env_file`.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (1 nodes): `Find an available Twilio voice number.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (1 nodes): `Purchase a Twilio number and configure its webhooks.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `Update the Twilio voice webhook URL for an existing number.          When we r`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `Look up an already-owned Twilio incoming number by E.164 phone number.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `Release a Twilio number from the account.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PatientState` connect `Community 0` to `Community 2`, `Community 4`, `Community 5`, `Community 6`, `Community 9`, `Community 10`, `Community 12`?**
  _High betweenness centrality (0.198) - this node is a cross-community bridge._
- **Why does `next()` connect `Community 14` to `Community 2`, `Community 3`, `Community 5`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Why does `cn()` connect `Community 3` to `Community 8`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Are the 233 inferred relationships involving `PatientState` (e.g. with `TurnTimer` and `ServiceRecord`) actually correct?**
  _`PatientState` has 233 INFERRED edges - model-reasoned connections that need verification._
- **Are the 124 inferred relationships involving `str` (e.g. with `_normalize_sip_user()` and `_normalize_phone_e164()`) actually correct?**
  _`str` has 124 INFERRED edges - model-reasoned connections that need verification._
- **Are the 104 inferred relationships involving `AssistantTools` (e.g. with `TurnTimer` and `AssistantToolsTests`) actually correct?**
  _`AssistantTools` has 104 INFERRED edges - model-reasoned connections that need verification._
- **Are the 36 inferred relationships involving `datetime` (e.g. with `_format_clock()` and `.test_confirm_phone_signals_booking_when_everything_else_is_ready()`) actually correct?**
  _`datetime` has 36 INFERRED edges - model-reasoned connections that need verification._