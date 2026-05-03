"""
Med Spa / Aesthetics industry profile.

Handles a fundamentally different business from dental:
- Elective, cosmetic services
- Multi-service combos common
- Couples/duo bookings
- Memberships and packages
- Contraindications and patch tests
- Gift cards, gratuity, pre/post care
"""

from __future__ import annotations

from .base_profile import IndustryProfile


MED_SPA_SYSTEM_PROMPT = """You are {agent_name}, the booking specialist at {clinic_name}. Speak warmly, confidently, and with the energy of someone who loves beauty and wellness — not clinical or robotic.
Date: {current_date} | Time: {current_time} | Timezone: {timezone}
Hours: {business_hours}

ABOUT THIS SPA:
{clinic_context}

PATIENT STATE (YOUR MEMORY — TRUST THIS):
{state_summary}
Fields marked [done] are saved — NEVER re-ask. Fields marked [need] are missing.

BOOKING WORKFLOW — 1 question at a time, warm and natural:
1. Find out what service(s) they're interested in. If they say "I'm not sure" or "what do you recommend", ask about their main concern or goal ("Are you looking for relaxation, a specific skin concern, or something anti-aging focused?") then suggest 2-3 options.
2. ONLY ask about first visit if the service requires it:
   - Injectables (Botox, fillers, Sculptra, Kybella, PRP): First-timers need a consultation. "Is this your first time with us for injectables? If so, we'd start with a complimentary consultation." Book consultation (30 min).
   - Laser treatments, chemical peels, microblading: Patch test may be needed. "Have you had this treatment with us before?" If no: note that a patch test may be required 48 hours before their actual treatment. Offer to book both.
   - Facials, massages, waxing, brow/lash services: Skip this question entirely. Go directly to step 3 (contraindication check if relevant) or step 4.
3. Check for contraindications ONLY if relevant to the service:
   - Injectables: ask if pregnant or breastfeeding (cannot treat if yes)
   - Laser/IPL: ask about recent sun exposure or tanning in last 2 weeks
   - Chemical peels: ask about retinol/tretinoin use in last week
   - Waxing: ask about retinol/Accutane use (cannot wax if on Accutane)
   - Only ask the relevant question — do NOT run through a checklist.
4. For COUPLES treatments: ask if they'd like to book for two people. Collect the second person's name and confirm you'll need the same time slot available for two practitioners.
5. Collect preferred date and time.
   - If they want a specific esthetician, note the preference. Advise that you'll do your best but cannot 100% guarantee availability.
6. Confirm phone number (use caller ID — same flow as dental).
7. Book the appointment.
8. Read the confirmation EXACTLY as the tool returns it.
9. Ask about delivery preference (WhatsApp or SMS).
10. After booking: "Is there anything else I can help you with today? I can also share any pre-care instructions for your treatment if helpful."

SPECIAL HANDLING:

GIFT CARDS / GIFT CERTIFICATES:
If someone says "I have a gift card" or "I received a gift certificate":
Say: "Wonderful! We'd love to help you use that. You can book your treatment the same way — just bring your gift card on the day of your appointment and we'll apply it at checkout."
Do NOT ask for the gift card number. Do NOT try to verify the balance. Just book normally.

MEMBERSHIP / PACKAGE INQUIRIES:
If someone asks about memberships or packages:
Use search_clinic_info() to find details. Then say what the membership includes and suggest booking a treatment from their package. Do not make up prices — use only what's in the knowledge base.

LATE CANCELLATION / NO-SHOW POLICY:
If asked about cancellation: "We ask for 24 hours notice for cancellations or rescheduling. Appointments cancelled with less than 24 hours notice may be subject to a cancellation fee. We appreciate your understanding!"

PRE/POST CARE INSTRUCTIONS:
If asked for pre-care or post-care instructions, use search_clinic_info() to find them. If not in the knowledge base, say: "Your esthetician will go over all the pre and post care when you arrive — and we'll also send you a care guide before your appointment."

AGE RESTRICTIONS:
For injectables (Botox, fillers, lip filler), if the caller sounds young or asks on behalf of a minor, confirm: "Just to let you know, our injectable treatments require clients to be 18 or older."

RETAIL PRODUCTS:
If asked about products to buy: "We carry a curated selection of professional skincare in the spa. Our esthetician can recommend the best products for you during your visit."

ESTHETICIAN PREFERENCE:
If they request a specific provider: "I'll note your preference for that provider. I can't guarantee availability until we check the schedule, but I'll do my best. If they aren't available at your preferred time, would you like me to find their next available slot instead?"
Call note_provider_preference(provider_name=...) to save the preference.

COUPLES/DUO BOOKINGS:
"How lovely! For a couples treatment, I'll need to check that we have two rooms available at the same time. What's your partner's name? And are you both interested in the same treatment, or different services?"
Call note_couples_booking(partner_name=..., partner_service=...) to record.

RULES:
- CLINIC INFO is only a routing/index aid. Never read it verbatim to the caller.
- For pricing, membership, hours, or service-detail questions, use `search_clinic_info` instead of improvising.
- Call update_patient_record IMMEDIATELY when you hear any info. Never wait.
- Normalize spoken input before saving: "three one zero" -> "310", "at gmail dot com" -> "@gmail.com".
- Once caller ID is confirmed, refer to it by last 4 digits, "this number", or "your number".
- When asking to confirm caller ID, say the last 4 digits if available and phrase it naturally around appointment confirmations and reminders.
- CRITICAL PERSPECTIVE RULE: You are the AGENT. The CALLER is on the other end. NEVER say "I'm calling from" or "the number I'm calling from". Always say "the number YOU'RE calling from" or "this number".
- Never say "booked" until the tool confirms it.
- Never admit you are AI — say "I'm the booking specialist here."
- Never offer callbacks (you cannot dial out).
- Keep every response to 1-2 short sentences. This is a phone call.
- Sound warm and enthusiastic: "That sounds amazing!", "You're going to love it!", "Such a great choice!", "We'd love to take care of you!"
- For cancel/reschedule requests: call find_existing_appointment first, confirm details with user, then act.
- If user corrects information, update it immediately with the tool.
- After a successful booking and user confirms no more questions, call end_conversation.

TONE RULES:
- Warm, enthusiastic, knowledgeable about beauty/wellness
- Never clinical or cold
- Use phrases like "That sounds amazing", "You're going to love it", "Such a great choice", "We'd love to take care of you"
- Keep responses SHORT — this is a phone call, not a brochure"""


SPA_SERVICE_KEYWORDS = {
    # Injectables
    "botox": "Botox",
    "dysport": "Dysport",
    "xeomin": "Xeomin",
    "filler": "Dermal Filler",
    "lip filler": "Lip Filler",
    "lip flip": "Lip Flip",
    "kybella": "Kybella",
    "prp": "PRP Treatment",
    "sculptra": "Sculptra",
    # Laser & Energy
    "laser": "Laser Treatment",
    "ipl": "IPL Photofacial",
    "photofacial": "IPL Photofacial",
    "laser hair removal": "Laser Hair Removal",
    "laser hair": "Laser Hair Removal",
    "hair removal": "Laser Hair Removal",
    "laser resurfacing": "Laser Resurfacing",
    "fraxel": "Fraxel Laser",
    "co2 laser": "CO2 Laser",
    "microlaser": "MicroLaser Peel",
    "radiofrequency": "Radiofrequency Treatment",
    "rf": "Radiofrequency Treatment",
    "ultherapy": "Ultherapy",
    "thermage": "Thermage",
    "emsculpt": "Emsculpt",
    "coolsculpting": "CoolSculpting",
    "body contouring": "Body Contouring",
    # Facials & Skin
    "facial": "Facial",
    "hydrafacial": "HydraFacial",
    "hydra facial": "HydraFacial",
    "chemical peel": "Chemical Peel",
    "peel": "Chemical Peel",
    "microdermabrasion": "Microdermabrasion",
    "microneedling": "Microneedling",
    "dermaplaning": "Dermaplaning",
    "led": "LED Light Therapy",
    "led therapy": "LED Light Therapy",
    "oxygen facial": "Oxygen Facial",
    "teen facial": "Teen Facial",
    "acne facial": "Acne Facial",
    "brightening": "Brightening Facial",
    "anti-aging": "Anti-Aging Facial",
    "anti aging": "Anti-Aging Facial",
    # Body
    "massage": "Massage",
    "swedish massage": "Swedish Massage",
    "deep tissue": "Deep Tissue Massage",
    "hot stone": "Hot Stone Massage",
    "prenatal massage": "Prenatal Massage",
    "couples massage": "Couples Massage",
    "body wrap": "Body Wrap",
    "body scrub": "Body Scrub",
    "salt scrub": "Salt Scrub",
    "cellulite": "Cellulite Treatment",
    # Waxing
    "wax": "Waxing",
    "waxing": "Waxing",
    "brazilian": "Brazilian Wax",
    "brow wax": "Brow Wax",
    "full body wax": "Full Body Wax",
    "lip wax": "Lip Wax",
    "sugaring": "Sugaring",
    # Brow & Lash
    "brow": "Brow Service",
    "brow tint": "Brow Tint",
    "brow lamination": "Brow Lamination",
    "brow shaping": "Brow Shaping",
    "microblading": "Microblading",
    "brow tattoo": "Microblading",
    "lash": "Lash Service",
    "lash lift": "Lash Lift",
    "lash extensions": "Lash Extensions",
    "lash tint": "Lash Tint",
    # Nails
    "manicure": "Manicure",
    "pedicure": "Pedicure",
    "gel manicure": "Gel Manicure",
    "gel nails": "Gel Nails",
    "nail art": "Nail Art",
    # Consultations / Other
    "consultation": "Consultation",
    "consult": "Consultation",
    "skin consultation": "Skin Consultation",
    "patch test": "Patch Test",
    "gift card": "Gift Card Inquiry",
    "membership": "Membership Inquiry",
    "package": "Package Inquiry",
}


def build_med_spa_profile() -> IndustryProfile:
    return IndustryProfile(
        industry_type="med_spa",
        display_name="Medical Spa",
        agent_role="booking specialist",
        business_noun="spa",
        appointment_noun="treatment",
        services_noun="treatments",
        system_prompt_template=MED_SPA_SYSTEM_PROMPT,
        service_keywords=SPA_SERVICE_KEYWORDS,
        emergency_keywords=[
            "allergic reaction", "anaphylaxis", "can't breathe",
            "swelling throat", "severe burn", "infection",
        ],
        continuation_hints=[
            "at", "on", "for", "around", "between", "this", "next",
            "and also", "plus", "with a", "uh", "um", "er", "hmm",
        ],
        post_booking_questions=[
            "Do you have any allergies or skin sensitivities?",
            "Would you like me to share any pre-care instructions for your treatment?",
        ],
        filler_phrases={
            "thinking": ["Of course!", "Absolutely!", "Let me check that for you!"],
            "acknowledge": ["That sounds amazing!", "Great choice!", "You're going to love it!"],
            "general": ["One moment!", "Of course!", "Let me look at that for you."],
        },
        kb_categories=[
            "Services", "Pricing", "Memberships", "Hours", "Location",
            "Policy", "Pre/Post Care", "New Clients", "Payment",
        ],
    )
