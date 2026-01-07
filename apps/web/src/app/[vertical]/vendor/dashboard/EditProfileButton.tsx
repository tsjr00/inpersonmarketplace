'use client'

import { useRouter } from 'next/navigation'

interface EditProfileButtonProps {
  vertical: string
}

export default function EditProfileButton({ vertical }: EditProfileButtonProps) {
  const router = useRouter()

  const handleEdit = () => {
    router.push(`/${vertical}/vendor/edit`)
  }

  return (
    <button
      onClick={handleEdit}
      style={{
        padding: '8px 16px',
        backgroundColor: '#0070f3',
        color: 'white',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
        fontWeight: 600,
        fontSize: 14
      }}
    >
      Edit Profile
    </button>
  )
}
