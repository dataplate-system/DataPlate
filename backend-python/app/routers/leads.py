from fastapi import APIRouter, Response, status

from app.schemas import DemoContactEmailRequest
from app.services import send_demo_contact_email


router = APIRouter(prefix="/api/leads", tags=["leads"])


@router.post("/demo-contact-email", status_code=status.HTTP_204_NO_CONTENT)
def send_demo_contact(request: DemoContactEmailRequest) -> Response:
    send_demo_contact_email(request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
