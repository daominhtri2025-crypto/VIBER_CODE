from sqlalchemy.orm import Session

from app.core.security import sha256_hex
from app.models.audit import AuditLog


def record_audit(
    db: Session,
    *,
    action: str,
    entity: str,
    actor_id: int | None = None,
    entity_id: str | None = None,
    client_ip: str | None = None,
) -> None:
    """Ghi nhật ký hành động Admin (NFR-05). IP chỉ lưu dạng băm (NFR-06)."""
    entry = AuditLog(
        actor_id=actor_id,
        action=action,
        entity=entity,
        entity_id=entity_id,
        ip_hash=sha256_hex(client_ip) if client_ip else None,
    )
    db.add(entry)
    db.commit()
