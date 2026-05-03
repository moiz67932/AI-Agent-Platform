# Graph Report - Agent  (2026-05-03)

## Corpus Check
- 196 files · ~177,303 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1836 nodes · 3610 edges · 43 communities detected
- Extraction: 73% EXTRACTED · 27% INFERRED · 0% AMBIGUOUS · INFERRED: 962 edges (avg confidence: 0.75)
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
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]

## God Nodes (most connected - your core abstractions)
1. `PatientState` - 239 edges
2. `AssistantTools` - 112 edges
3. `AssistantToolsTests` - 36 edges
4. `AgentServerManager` - 34 edges
5. `cn()` - 34 edges
6. `TurnTakingPolicyTests` - 33 edges
7. `StreamingTurnTracker` - 32 edges
8. `preview_turn()` - 32 edges
9. `_normalize_space()` - 31 edges
10. `CallLogger` - 31 edges

## Surprising Connections (you probably didn't know these)
- `_handle_post_booking_turn()` --calls--> `user_declined_anything_else()`  [INFERRED]
  agent.py → utils/agent_flow.py
- `TurnTimer` --uses--> `PatientState`  [INFERRED]
  agent.py → models/state.py
- `TurnTimer` --uses--> `AssistantTools`  [INFERRED]
  agent.py → tools/assistant_tools.py
- `TestTurnTimer` --uses--> `TurnTimer`  [INFERRED]
  tests/test_latency_paths.py → agent.py
- `TestResolutionConfirmationIntent` --uses--> `TurnTimer`  [INFERRED]
  tests/test_latency_paths.py → agent.py

## Communities

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (85): _handle_deterministic_confirmation_turn(), _infer_expected_slot_from_response(), datetime, Data models for the dental AI agent., contact_phase_allowed(), PatientState, Patient state management., Concise state snapshot for the dynamic system prompt. (+77 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (142): create_azure_tts(), Azure TTS wrapper — Thin convenience wrapper around livekit-plugins-azure.  Th, Create an Azure TTS instance using the official LiveKit Azure plugin.      Arg, Pipeline module — Houses Urdu voice pipeline components.  The English pipeline, build_english_pipeline(), build_urdu_pipeline(), get_pipeline_components(), Pipeline Configuration — Centralized builder for English & Urdu pipelines.  Re (+134 more)

### Community 2 - "Community 2"
Cohesion: 0.02
Nodes (56): addToRemoveQueue(), dispatch(), genId(), reducer(), toast(), useToast(), useAgent(), useAgents() (+48 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (134): global_exception_handler(), lifespan(), _dispatch_rule_matches(), _is_duplicate_livekit_resource_error(), _normalize_config_json(), Telnyx number provisioning with LiveKit SIP dispatch setup., Create a LiveKit inbound trunk and SIP dispatch rule for the agent., Normalize DB JSON values into a dictionary for provisioning logic. (+126 more)

### Community 4 - "Community 4"
Cohesion: 0.02
Nodes (109): Fill obvious missing slots from recent caller context without waiting on the LLM, _seed_state_from_recent_context(), cancel_appointment(), find_all_appointments_by_phone(), find_appointment_by_phone(), Appointment management service for cancellation and rescheduling operations., Reschedule an existing appointment to a new time.          Args:         appo, Find all appointments for a given phone number.     Useful for disambiguation w (+101 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (58): _needs_filler(), Record timestamp for label. Returns elapsed ms since t0 (or 0 for first mark)., Return ms between two marks. None if either mark is missing., Emit one structured log line with all computed deltas., Preview whether policy would allow a filler for this utterance., TurnTimer, Enum, Scenario: time is available, phone is pending confirmation.     After confirm_ph (+50 more)

### Community 6 - "Community 6"
Cohesion: 0.03
Nodes (66): Initialize the Twilio and LiveKit clients., _create_calendar_event_sync(), Create a Google Calendar event using service-account credentials.      Params:, CalendarConnection, SupabaseCalendarStore, RuntimeError, load_telnyx_config(), Async Telnyx REST client used by telephony services. (+58 more)

### Community 7 - "Community 7"
Cohesion: 0.03
Nodes (57): AgentServerManager, _connect(), load_ssh_key(), normalize_key_path(), _parse_env_content(), Remote deployment manager for per-agent webhook and worker processes., Initialize the SSH-backed deployment manager., Return the remote directory for an agent deployment. (+49 more)

### Community 8 - "Community 8"
Cohesion: 0.04
Nodes (34): _complete_state(), _make_tools(), tests/test_latency_paths.py  Unit + integration-style tests for the three key la, Verify the TurnTimer produces correct deltas and log output., _needs_filler must suppress filler for time/slot inputs (avoids gap collision)., Scenario: caller gives name and reason.     Expected: tool saves fields, returns, When time_suggestion hits an available slot, tool should return the         phon, confirm_phone(True) must mark phone_confirmed=True and set all flags. (+26 more)

### Community 9 - "Community 9"
Cohesion: 0.05
Nodes (53): _build_missing_slot_prompt(), _build_no_repeat_llm_instruction(), _build_post_phone_confirmation_prompt(), _caller_number_confirmation_message(), _choose_filler(), _closing_text_for_state(), entrypoint(), _entrypoint_impl() (+45 more)

### Community 10 - "Community 10"
Cohesion: 0.05
Nodes (37): LoggingConfigTests, CallLogger, create_call_logger(), mask_phone(), CallLogger - Centralized Logging & Observability for LiveKit Voice Agent.  Thi, Mask phone number for safe logging.     Example: +13105551234 -> ***1234, Remove or mask sensitive data from payload before logging., Centralized call logging with dual-destination strategy:     - Cloud Logging: S (+29 more)

### Community 11 - "Community 11"
Cohesion: 0.08
Nodes (29): buildGeneratedKnowledgeArticles(), buildHoursKnowledgeBody(), buildPricingBody(), buildServicesOverviewBody(), defaultFullWorkingHours(), fromKnowledgeArticleRow(), fullToCompactWorkingHours(), normalizeServices() (+21 more)

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (36): _agent_config(), _agent_id(), _agent_name(), _bridge_call_to_agent(), _build_livekit_destination(), _derive_status(), _duration_seconds(), _event_time() (+28 more)

### Community 13 - "Community 13"
Cohesion: 0.07
Nodes (30): attach_calendar_event_id(), book_to_supabase(), fetch_clinic_context_optimized(), fetch_day_appointments(), _normalize_appointment_source(), Database service for Supabase operations.  Handles: - Clinic context fetching, Fetch ALL appointments for a date in ONE query.     Returns list of (start_time, Insert appointment row in Supabase.     Returns appointment_id on success, None (+22 more)

### Community 14 - "Community 14"
Cohesion: 0.08
Nodes (27): _build_fallback_context(), entrypoint(), get_agent_config(), get_livekit_agent_name(), _install_context_override(), load_agent_runtime_env(), _merge_nested_dict(), Thin wrapper over `agent.py` for per-tenant environment-driven config. (+19 more)

### Community 15 - "Community 15"
Cohesion: 0.12
Nodes (20): authMiddleware(), errorHandler(), next(), agentSecretAuth(), candidate_platform_base_urls(), check_platform_health(), create_or_reuse_test_agent(), find_existing_test_agents() (+12 more)

### Community 16 - "Community 16"
Cohesion: 0.08
Nodes (25): _convert_spoken_digits_for_email(), normalize_email(), normalize_phone(), Convert spoken digit words to numeric digits for email local parts.      "moiz, Normalize spoken email to standard email format.      Processing order (CRITIC, # IMPORTANT: Require either "at" prefix, colon for minutes, or am/pm suffix, Remove spoken email introducer phrases so that normalization applies     only t, _strip_email_introducer() (+17 more)

### Community 17 - "Community 17"
Cohesion: 0.1
Nodes (14): _dispatch_rule_matches(), _is_duplicate_livekit_resource_error(), _normalize_config_json(), Twilio phone number provisioning with LiveKit SIP dispatch setup., Create a LiveKit inbound trunk and SIP dispatch rule for the agent., Normalize DB JSON values into a dictionary for Twilio provisioning logic., Return True when LiveKit rejected a create due to an existing equivalent resourc, Provision a phone number and save it on the agent record. (+6 more)

### Community 18 - "Community 18"
Cohesion: 0.19
Nodes (9): getRawStatusesForOutcome(), isBookedAppointmentStatus(), matchAppointmentToCall(), normalizeAgentRecord(), normalizeCallOutcome(), normalizePhone(), safeDate(), serializeAppointment() (+1 more)

### Community 19 - "Community 19"
Cohesion: 0.15
Nodes (11): IndustryProfile, Abstract base for industry profiles.  Every industry (dental, med_spa, hvac, res, Format the system prompt template with runtime values., build_dental_profile(), Dental industry profile.  Preserves 100% of the existing dental agent behavior —, Industry profile system for multi-industry AI receptionist platform., build_med_spa_profile(), Med Spa / Aesthetics industry profile.  Handles a fundamentally different busine (+3 more)

### Community 20 - "Community 20"
Cohesion: 0.16
Nodes (2): AgentRuntimeConfigTests, _find_function()

### Community 21 - "Community 21"
Cohesion: 0.16
Nodes (7): Latency tracking and performance monitoring utilities., Lightweight latency tracker for voice agent turns.     Logs structured timing d, Record a timestamp for a labeled event., Track whether filler was played or suppressed., Get elapsed time in ms for a label., Emit a single structured log line with all latency data., TurnMetrics

### Community 22 - "Community 22"
Cohesion: 0.18
Nodes (5): run(), livekit_cleanup(), main(), One-shot cleanup script:   1. SSH into Hetzner and remove all agent supervisor p, ssh_cleanup()

### Community 23 - "Community 23"
Cohesion: 0.44
Nodes (9): _build_parser(), candidate_platform_base_urls(), check_platform_health(), http_json(), main(), normalize_agent_id(), print_failure_logs(), verify_agent_health() (+1 more)

### Community 24 - "Community 24"
Cohesion: 0.31
Nodes (8): BaseModel, FindRelativeSlotsArgs, GetAvailableSlotsV2Args, Pydantic models for tool function arguments., Sanitize tool arguments - removes None, empty strings, and 'null' literals., _sanitize_tool_arg(), SearchClinicInfoArgs, UpdatePatientRecordArgs

### Community 25 - "Community 25"
Cohesion: 0.32
Nodes (7): _build_parser(), _main(), Poll an agent health endpoint until it becomes live., Poll the agent `/health` endpoint until it returns HTTP 200.      Params:, Create the CLI argument parser.      Returns:         Configured argument parser, Parse CLI args and print the verification result.      Returns:         None., verify_agent()

### Community 26 - "Community 26"
Cohesion: 0.57
Nodes (4): _function(), _has_livekit_plugin_import(), LiveKitPluginImportTests, _parse()

### Community 27 - "Community 27"
Cohesion: 0.48
Nodes (5): _call_initiated_event(), test_parse_event_accepts_telnyx_data_envelope(), test_parse_event_accepts_telnyx_v1_top_level_event_envelope(), test_parse_event_accepts_telnyx_voice_metadata_event_envelope(), test_parse_event_normalizes_telnyx_v1_underscore_event_names()

### Community 29 - "Community 29"
Cohesion: 0.6
Nodes (3): _build_tools(), _main(), _run_case()

### Community 32 - "Community 32"
Cohesion: 0.5
Nodes (3): map_call_outcome(), Configuration and constants for the dental AI agent.  Contains all environment, Maps internal call results to DB-safe call_outcome enum values.     NEVER retur

### Community 33 - "Community 33"
Cohesion: 0.5
Nodes (2): Agent prompts and system instructions., Agent prompt templates.

### Community 34 - "Community 34"
Cohesion: 0.5
Nodes (3): __getattr__(), Service modules package.  Contains business logic services for: - Database op, Lazily expose common service helpers without importing every integration.

### Community 35 - "Community 35"
Cohesion: 0.83
Nodes (3): _load_platform_utils(), test_generate_subdomain_is_stable_and_safe(), test_mask_secret_redacts_middle()

### Community 36 - "Community 36"
Cohesion: 0.5
Nodes (3): __getattr__(), Utility modules for the dental AI agent., Lazily expose utility helpers without importing unrelated runtime config.

### Community 39 - "Community 39"
Cohesion: 0.67
Nodes (2): LLM Function Tools package.  This package contains the AssistantTools class wi, # TODO: Import AssistantTools once created

### Community 43 - "Community 43"
Cohesion: 1.0
Nodes (1): Database package for platform schema and async helpers.

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (1): Open a Paramiko SSH connection with retry semantics.

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (1): Parse a simple dotenv file produced by `_render_env_file`.

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (1): Find an available Twilio voice number.

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (1): Purchase a Twilio number and configure its webhooks.

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (1): Update the Twilio voice webhook URL for an existing number.          When we reu

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (1): Look up an already-owned Twilio incoming number by E.164 phone number.

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (1): Release a Twilio number from the account.

## Knowledge Gaps
- **429 isolated node(s):** `agent.py — Dental Voice AI Agent (Latency-Optimized, Instrumented)  Target lat`, `Record timestamp for label. Returns elapsed ms since t0 (or 0 for first mark).`, `Return ms between two marks. None if either mark is missing.`, `Emit one structured log line with all computed deltas.`, `Normalize SIP URI fragments to E.164 format.` (+424 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 20`** (14 nodes): `AgentRuntimeConfigTests`, `.test_agent_refresh_updates_running_instructions()`, `.test_agent_session_increases_max_tool_steps()`, `.test_agent_uses_supported_livekit_state_events()`, `.test_clinic_faq_prompt_context_is_index_only()`, `.test_interrupt_filler_forces_interruption()`, `.test_safe_say_sanitizes_clinic_pricing_before_tts()`, `.test_send_filler_keeps_filler_outside_chat_context_but_interruptible()`, `.test_stt_keyterms_include_clinic_and_med_spa_services()`, `.test_system_prompt_uses_booking_confirmation_wording_for_phone()`, `.test_worker_main_does_not_force_reset_root_logging()`, `_find_function()`, `test_agent_runtime_config.py`, `setUpClass()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (4 nodes): `agent_prompts.py`, `Agent prompts and system instructions.`, `__init__.py`, `Agent prompt templates.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (3 nodes): `__init__.py`, `LLM Function Tools package.  This package contains the AssistantTools class wi`, `# TODO: Import AssistantTools once created`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (2 nodes): `__init__.py`, `Database package for platform schema and async helpers.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (1 nodes): `Open a Paramiko SSH connection with retry semantics.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (1 nodes): `Parse a simple dotenv file produced by `_render_env_file`.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (1 nodes): `Find an available Twilio voice number.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (1 nodes): `Purchase a Twilio number and configure its webhooks.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (1 nodes): `Update the Twilio voice webhook URL for an existing number.          When we reu`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (1 nodes): `Look up an already-owned Twilio incoming number by E.164 phone number.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `Release a Twilio number from the account.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PatientState` connect `Community 0` to `Community 1`, `Community 4`, `Community 5`, `Community 8`, `Community 9`, `Community 10`, `Community 29`?**
  _High betweenness centrality (0.185) - this node is a cross-community bridge._
- **Why does `next()` connect `Community 15` to `Community 1`, `Community 2`?**
  _High betweenness centrality (0.109) - this node is a cross-community bridge._
- **Why does `cn()` connect `Community 2` to `Community 22`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Are the 229 inferred relationships involving `PatientState` (e.g. with `TurnTimer` and `ServiceRecord`) actually correct?**
  _`PatientState` has 229 INFERRED edges - model-reasoned connections that need verification._
- **Are the 122 inferred relationships involving `str` (e.g. with `_normalize_sip_user()` and `_normalize_phone_e164()`) actually correct?**
  _`str` has 122 INFERRED edges - model-reasoned connections that need verification._
- **Are the 104 inferred relationships involving `AssistantTools` (e.g. with `TurnTimer` and `AssistantToolsTests`) actually correct?**
  _`AssistantTools` has 104 INFERRED edges - model-reasoned connections that need verification._
- **Are the 34 inferred relationships involving `datetime` (e.g. with `_format_clock()` and `.test_confirm_phone_signals_booking_when_everything_else_is_ready()`) actually correct?**
  _`datetime` has 34 INFERRED edges - model-reasoned connections that need verification._