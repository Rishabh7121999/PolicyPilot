from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field


class WaitingPeriod(BaseModel):
    condition: str | None = Field(default=None, description="The condition or procedure the waiting period applies to, e.g. 'Cataract' or 'Pre-existing diseases'")
    duration: str | None = Field(default=None, description="The waiting period duration as stated in the policy, e.g. '24 months' or '30 days'")


class PolicySummary(BaseModel):
    policy_number: str | None = Field(default=None, description="The policy number / certificate number")
    insurer: str | None = Field(default=None, description="The insurance company name")
    product_name: str | None = Field(default=None, description="The name of the insurance product/plan")
    policyholder_name: str | None = Field(default=None, description="The primary policyholder's name")
    sum_insured: str | None = Field(default=None, description="The sum insured / sum assured amount, with currency")
    premium_amount: str | None = Field(default=None, description="The premium amount, with currency and frequency if stated")
    premium_due_date: str | None = Field(default=None, description="The next premium due date")
    policy_start_date: str | None = Field(default=None, description="The policy start / commencement date")
    policy_end_date: str | None = Field(default=None, description="The policy end / expiry date")
    plan_variant: str | None = Field(default=None, description="The specific plan variant or tier selected")
    riders: list[str] = Field(default_factory=list, description="Any add-ons / riders attached to the policy")
    waiting_periods: list[WaitingPeriod] = Field(default_factory=list, description="Key waiting periods called out in the policy")
    key_exclusions: list[str] = Field(default_factory=list, description="Major exclusions listed in the policy")
    nominee: str | None = Field(default=None, description="The nominee's name, for life policies")
    claim_process_summary: str | None = Field(default=None, description="A brief summary of how to file a claim")


llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    temperature=0
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
5. Dates and amounts should be copied as they appear in the document (don't reformat currency).

Policy Document:
{document_text}
""")

_chain = prompt | structured_llm


def extract_policy_summary(full_text: str) -> PolicySummary:
    return _chain.invoke({"document_text": full_text})
