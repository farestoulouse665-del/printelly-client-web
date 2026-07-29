from __future__ import annotations

import argparse
import getpass

from sqlalchemy import select

from app.core.auth import hash_password
from app.db.session import SessionLocal
from app.models.entities import User


def main() -> int:
    parser = argparse.ArgumentParser(description="Crée ou promeut un administrateur PRINTELLY.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default="Administrateur PRINTELLY")
    parser.add_argument("--password", default="")
    args = parser.parse_args()

    email = args.email.strip().lower()
    password = args.password or getpass.getpass("Mot de passe (12 caractères minimum): ")
    if len(password) < 12:
        raise SystemExit("Le mot de passe doit contenir au moins 12 caractères.")

    with SessionLocal() as database:
        user = database.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                email=email,
                display_name=args.name.strip()[:120],
                password_hash=hash_password(password),
                locale="fr",
                is_active=True,
                is_admin=True,
            )
            database.add(user)
            action = "créé"
        else:
            user.display_name = args.name.strip()[:120] or user.display_name
            user.password_hash = hash_password(password)
            user.is_active = True
            user.is_admin = True
            action = "promu"
        database.commit()
        database.refresh(user)
        print(f"Administrateur {action}: {user.email} ({user.id})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
