"""
recommendations.py - Actionable recommendation engine
=======================================================
Generates structured, clinically-inspired recommendations based on:
  • Overall risk level
  • Domain-specific scores
  • Age of the child
  • Whether borderline case
  • Previous screening comparison
"""

from backend.questions import DOMAIN_SOCIAL, DOMAIN_COMMUNICATION, DOMAIN_BEHAVIORAL


# ── Base recommendations by risk level ────────────────────────────────────────
BASE_RECOMMENDATIONS: dict[str, list[str]] = {
    "Low": [
        "Continue regular developmental check-ups with your pediatrician.",
        "Engage in age-appropriate play that encourages social interaction (peek-a-boo, pointing games).",
        "Read to your child daily to support language and communication development.",
        "Encourage shared attention by following your child's gaze and naming what they look at.",
        "Re-screen in 3–6 months if you notice any new developmental concerns.",
    ],
    "Moderate": [
        "Schedule a developmental evaluation with your pediatrician within 4–6 weeks.",
        "Request a referral to a speech-language therapist to assess communication development.",
        "Enrol in early intervention programs that focus on social and communication skills.",
        "Keep a daily log of your child's communication, play, and social behaviours to share with specialists.",
        "Avoid excessive screen time; prioritise face-to-face interaction and responsive play.",
        "Join a parent support group for early ASD screening guidance.",
        "Re-screen in 4–6 weeks or sooner if concerns increase.",
    ],
    "High": [
        "Seek an urgent referral to a developmental paediatrician or child psychologist.",
        "Request a comprehensive ASD diagnostic evaluation (ADOS-2/ADI-R) as soon as possible.",
        "Begin speech and language therapy immediately - early intervention significantly improves outcomes.",
        "Contact your local early childhood intervention service for a multi-disciplinary assessment.",
        "Apply for occupational therapy assessment, especially if sensory sensitivities are present.",
        "Discuss Applied Behaviour Analysis (ABA) or similar evidence-based therapies with your specialist.",
        "Inform your child's nursery or playgroup so they can provide additional support.",
        "Connect with national autism support organisations (e.g., Autism Speaks, NAS).",
    ],
    "Very High": [
        "Seek an immediate referral to a specialist developmental team - do not delay.",
        "Request expedited diagnostic assessment (ADOS-2 / ADI-R) within the next 2 weeks.",
        "Begin speech, occupational, and behavioural therapies in parallel - do not wait for a formal diagnosis.",
        "Contact your national autism helpline for urgent guidance and support pathways.",
        "Inform all caregivers, nursery staff, and family members about the child's needs.",
        "Investigate government-funded early intervention programmes in your region immediately.",
        "Consider a second clinical opinion if a referral takes longer than 4 weeks.",
        "Document all behaviours with video recordings to assist clinicians during evaluation.",
    ],
}

# ── Domain-specific supplementary recommendations ────────────────────────────
DOMAIN_RECOMMENDATIONS: dict[str, list[str]] = {
    DOMAIN_SOCIAL: [
        "Practise joint attention activities: point at objects and wait for your child to look.",
        "Use social stories and visual schedules to support social understanding.",
        "Arrange structured play dates with same-age peers in a calm, predictable environment.",
        "Mirror your child's play actions to build social reciprocity.",
    ],
    DOMAIN_COMMUNICATION: [
        "Use simple, clear sentences and pause to give your child time to respond.",
        "Introduce augmentative and alternative communication (AAC) tools if verbal speech is limited.",
        "Narrate daily activities ('Now we are washing hands') to build vocabulary.",
        "Use picture exchange systems (PECS) if your child shows limited pointing or gesturing.",
    ],
    DOMAIN_BEHAVIORAL: [
        "Maintain consistent daily routines - predictability reduces anxiety and difficult behaviours.",
        "Identify and minimise sensory triggers (loud noises, bright lights, certain textures).",
        "Introduce new activities gradually with visual previews to reduce distress.",
        "Work with an occupational therapist to develop a sensory diet tailored to your child.",
    ],
}

# ── Age-specific notes ────────────────────────────────────────────────────────
def get_age_note(age_months: int) -> str:
    if age_months < 18:
        return (
            "At this age (under 18 months), many skills are still emerging. "
            "Even if risk indicators are present, early intervention at this stage yields the best outcomes. "
            "Do not wait for a formal diagnosis before seeking support."
        )
    elif age_months < 24:
        return (
            "Between 18–24 months is a critical window for early intervention. "
            "If concerns are identified, beginning support now can significantly improve long-term outcomes."
        )
    elif age_months < 36:
        return (
            "At 2–3 years, children should be demonstrating clear social and communication milestones. "
            "Any significant gaps at this age warrant prompt professional evaluation."
        )
    else:
        return (
            "By 3–4 years, most social and language milestones are well established. "
            "Persistent difficulties at this age should be evaluated comprehensively without delay."
        )


def generate_recommendations(
    risk_level: str,
    domain_scores: dict,          # domain name → DomainScore
    age_months: int,
    is_borderline: bool = False,
    trend: str = "none",          # "improving", "declining", "stable", "none"
) -> dict:
    """
    Returns a structured recommendations dictionary.
    """
    output = {
        "primary": BASE_RECOMMENDATIONS.get(risk_level, []),
        "domain_specific": [],
        "age_note": get_age_note(age_months),
        "borderline_note": "",
        "trend_note": "",
        "monitoring_interval": "",
    }

    # Domain-specific supplements (only for domains scoring > 50%)
    HIGH_DOMAIN_THRESHOLD = 50.0
    for domain, ds in domain_scores.items():
        if hasattr(ds, "percentage"):
            pct = ds.percentage
        else:
            pct = ds.get("percentage", 0)

        if pct >= HIGH_DOMAIN_THRESHOLD:
            recs = DOMAIN_RECOMMENDATIONS.get(domain, [])
            for r in recs:
                output["domain_specific"].append(f"[{domain}] {r}")

    # Borderline note
    if is_borderline:
        output["borderline_note"] = (
            "This result is near a classification boundary. "
            "A single follow-up screening in 4–6 weeks is strongly recommended before drawing conclusions."
        )

    # Trend note (for re-screenings)
    trend_notes = {
        "improving": "✅ Scores show improvement since last screening. Continue current interventions and re-screen in 8 weeks.",
        "declining":  "⚠ Scores have declined since last screening. Escalate to a professional evaluation urgently.",
        "stable":     "Scores remain stable. Continue monitoring and re-screen in 4–6 weeks.",
        "none":       "",
    }
    output["trend_note"] = trend_notes.get(trend, "")

    # Monitoring interval recommendation
    intervals = {
        "Low":       "Re-screen in 3–6 months or sooner if new concerns arise.",
        "Moderate":  "Re-screen in 4–6 weeks alongside a developmental evaluation.",
        "High":      "Re-screen after your first specialist appointment (typically 2–4 weeks).",
        "Very High": "Formal diagnostic assessment takes priority over re-screening.",
    }
    output["monitoring_interval"] = intervals.get(risk_level, "")

    return output
    