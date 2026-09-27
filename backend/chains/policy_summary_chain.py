from typing import Literal

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field


class WaitingPeriod(BaseModel):
    condition: str | None = Field(default=None, description="The condition or procedure the waiting period applies to, e.g. 'Cataract' or 'Pre-existing diseases'")
    duration: str | None = Field(default=None, description="The waiting period duration as stated in the policy, e.g. '24 months' or '30 days'")


class FAQ(BaseModel):
    question: str = Field(description="A question a policyholder would plausibly ask about this specific policy")
    answer: str = Field(description="A concise answer grounded only in what the document actually states")


class HealthDetails(BaseModel):
    room_rent_limit: str | None = Field(default=None, description="Room rent capping/limit, e.g. '1% of sum insured per day' or 'Single Private Room'")
    pre_hospitalization_days: str | None = Field(default=None, description="Pre-hospitalization expense cover period, e.g. '30 days'")
    post_hospitalization_days: str | None = Field(default=None, description="Post-hospitalization expense cover period, e.g. '60 days'")
    co_pay_percentage: str | None = Field(default=None, description="Co-payment percentage the policyholder must bear, if any")
    sub_limits: list[str] = Field(default_factory=list, description="Disease/procedure-wise sub-limits, e.g. 'Cataract: up to Rs 40,000'")
    day_care_procedures: list[str] = Field(default_factory=list, description="Day-care procedures explicitly covered")
    network_hospitals_info: str | None = Field(default=None, description="Whatever the document states about cashless/network hospitals or the TPA managing them (e.g. a TPA name or a URL) — not a full hospital directory")
    restoration_benefit: str | None = Field(default=None, description="Sum insured restoration/refill benefit, if any")
    no_claim_bonus: str | None = Field(default=None, description="No-claim bonus terms, e.g. '10% increase in sum insured per claim-free year'")
    maternity_cover: str | None = Field(default=None, description="Maternity benefit and its waiting period, if covered")
    ambulance_cover: str | None = Field(default=None, description="Ambulance charges cover, if any")
    health_checkup_benefit: str | None = Field(default=None, description="Free annual health checkup benefit, if any")


class LifeDetails(BaseModel):
    policy_term: str | None = Field(default=None, description="Total policy term")
    premium_paying_term: str | None = Field(default=None, description="Premium payment term, if different from the policy term")
    death_benefit: str | None = Field(default=None, description="The death benefit amount/formula")
    maturity_benefit: str | None = Field(default=None, description="The maturity benefit amount/formula, if any")
    surrender_value: str | None = Field(default=None, description="Surrender value terms, if stated")
    tax_benefit: str | None = Field(default=None, description="Tax benefit section referenced, e.g. '80C / 10(10D)'")
    free_look_period: str | None = Field(default=None, description="The free-look cancellation period")
    grace_period: str | None = Field(default=None, description="Grace period for premium payment")
    policy_loan_available: str | None = Field(default=None, description="Whether a loan against the policy is available, and terms if stated")
    plan_type: str | None = Field(default=None, description="The plan type, e.g. 'Term', 'Endowment', 'ULIP'")


class MotorDetails(BaseModel):
    registration_number: str | None = Field(default=None, description="The vehicle's registration number")
    make_model_variant: str | None = Field(default=None, description="Vehicle make, model, and variant")
    year_of_manufacture: str | None = Field(default=None, description="Year the vehicle was manufactured")
    idv: str | None = Field(default=None, description="Insured Declared Value")
    cover_type: str | None = Field(default=None, description="Comprehensive / Third-Party / Own-Damage")
    no_claim_bonus_percentage: str | None = Field(default=None, description="No-claim bonus percentage")
    add_ons: list[str] = Field(default_factory=list, description="Add-ons/riders, e.g. 'Zero Depreciation', 'Engine Protection', 'Roadside Assistance'")
    compulsory_deductible: str | None = Field(default=None, description="Compulsory deductible/excess amount")
    third_party_liability_limit: str | None = Field(default=None, description="Third-party liability cover limit")
    pa_cover_owner_driver: str | None = Field(default=None, description="Personal accident cover for owner-driver")
    cashless_garage_network_info: str | None = Field(default=None, description="Whatever the document states about the cashless garage network")


class PolicySummary(BaseModel):
    policy_type: Literal["health", "life", "motor", "unknown"] = Field(
        description="The type of insurance policy this document is, classified from its content. Use 'unknown' if it isn't a recognizable insurance policy or the type genuinely can't be determined."
    )
    policy_number: str | None = Field(default=None, description="The policy number / certificate number")
    insurer: str | None = Field(default=None, description="The insurance company name")
    product_name: str | None = Field(default=None, description="The name of the insurance product/plan")
    policyholder_name: str | None = Field(default=None, description="The primary policyholder's name")
    sum_insured: str | None = Field(default=None, description="The sum insured / sum assured amount, with currency, exactly as written in the document")
    sum_insured_numeric: float | None = Field(default=None, description="sum_insured normalized to a plain number in the base currency unit (e.g. '₹5,00,000' -> 500000, '1 Cr' -> 10000000), for aggregation. None if it can't be confidently normalized.")
    premium_amount: str | None = Field(default=None, description="The premium amount, with currency and frequency if stated")
    premium_due_date: str | None = Field(default=None, description="The next premium due date")
    policy_start_date: str | None = Field(default=None, description="The policy start / commencement date, exactly as written")
    policy_end_date: str | None = Field(default=None, description="The policy end / expiry / renewal date, exactly as written")
    policy_end_date_iso: str | None = Field(default=None, description="policy_end_date normalized to YYYY-MM-DD, only if it can be confidently parsed. None otherwise.")
    plan_variant: str | None = Field(default=None, description="The specific plan variant or tier selected")
    riders: list[str] = Field(default_factory=list, description="Any add-ons / riders attached to the policy")
    waiting_periods: list[WaitingPeriod] = Field(default_factory=list, description="Key waiting periods called out in the policy")
    key_exclusions: list[str] = Field(default_factory=list, description="Major exclusions listed in the policy")
    nominee: str | None = Field(default=None, description="The nominee's name, for life policies")
    claim_process_summary: str | None = Field(default=None, description="A brief summary of how to file a claim")
    faqs: list[FAQ] = Field(default_factory=list, description="4-6 frequently asked questions a policyholder would have about this specific policy (coverage, claims, waiting periods, premium), with concise answers grounded in the document")
    health_details: HealthDetails | None = Field(default=None, description="Populate only if policy_type is 'health'")
    life_details: LifeDetails | None = Field(default=None, description="Populate only if policy_type is 'life'")
    motor_details: MotorDetails | None = Field(default=None, description="Populate only if policy_type is 'motor'")


llm = ChatGoogleGenerativeAI(
    model="gemini-3.1-flash-lite",
    temperature=0,
    timeout=60,
    max_retries=2,
)

structured_llm = llm.with_structured_output(PolicySummary)

prompt = ChatPromptTemplate.from_template("""
You are an expert insurance policy analyst.

Read the full policy document below and extract the key facts into the requested structured fields.

Rules:
1. Only extract information that is actually present in the document. Leave a field empty/None if it is not stated.
2. Do not guess or infer amounts, dates, or names that aren't explicitly written.
3. For waiting_periods, list the most important/commonly asked-about ones (pre-existing diseases, specific illnesses/procedures, maternity, initial waiting period) rather than every single line item if the list is very long.
4. For key_exclusions, list the major categories of exclusions, not every sub-clause.
5. Dates and amounts should be copied as they appear in the document (don't reformat currency) into their string fields.
6. Classify policy_type from the document's own content and structure:
   - health: mentions hospitalization, room rent, co-pay, sum insured for medical treatment, cashless network hospitals.
   - life: mentions sum assured, nominee, maturity benefit, death benefit, policy term/premium-paying term.
   - motor: mentions a vehicle, registration number, IDV, own-damage/third-party cover, NCB, garage network.
   - unknown: the document isn't a recognizable insurance policy, or none of the above clearly applies.
   Populate ONLY the details object matching policy_type (health_details / life_details / motor_details) and leave the other two as null.
7. For sum_insured_numeric and policy_end_date_iso, only fill them in if you can confidently normalize the value; otherwise leave them None rather than guessing.
8. For faqs, write 4-6 questions a real policyholder would ask about THIS policy, with answers grounded only in what the document states.

Policy Document:
{document_text}
""")

_chain = prompt | structured_llm


def extract_policy_summary(full_text: str) -> PolicySummary:
    return _chain.invoke({"document_text": full_text})
